// Local-first encrypted entry store. Holds the decrypted entries on-device (so
// the catch-up flow and any history render instantly and offline), encrypts on
// the way out, and syncs with the server via entries.push / entries.pull.
//
// The server only ever sees opaque cells. Each entry's payload (incl. date+hour)
// is encrypted; the cell_id is an HMAC, so a fresh device pulls everything and
// rebuilds this store by decrypting.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { trpc } from "./trpc";
import { getDEK } from "./auth";
import { useDate } from "./time";
import { cellId, configCellId, openEntry, sealEntry, type EntryPayload } from "./crypto";
import {
    applyPulledConfig, loadTaxonomy, markTaxonomyClean,
    subscribeTaxonomy, taxonomyDirty, taxonomySealedRecord,
} from "./activities";

export interface LocalEntry {
    date: string; // "YYYY-M-D"
    hour: number; // 0-23
    activity: number | null;
    feeling: number | null;
    source: "manual" | "health";
    updatedAt: number; // epoch ms, logical clock for LWW
    deleted: boolean;
}

const STORE_KEY = "rn_entries";
const CURSOR_KEY = "rn_cursor";
const HOUR_MS = 60 * 60 * 1000;

let store: Record<string, LocalEntry> = {}; // cellId -> entry
let cursor = 0; // server receivedAt cursor for incremental pull
const dirty = new Set<string>(); // cellIds with un-pushed local changes
let loaded = false;

const listeners = new Set<() => void>();
function emit() {
    for (const l of listeners) l();
}

export function subscribeEntries(fn: () => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

async function persist() {
    await Promise.all([
        AsyncStorage.setItem(STORE_KEY, JSON.stringify(store)),
        AsyncStorage.setItem(CURSOR_KEY, String(cursor)),
    ]);
}

export async function loadStore(): Promise<void> {
    if (loaded) return;
    const [s, c] = await Promise.all([AsyncStorage.getItem(STORE_KEY), AsyncStorage.getItem(CURSOR_KEY), loadTaxonomy()]);
    store = s ? JSON.parse(s) : {};
    cursor = c ? Number(c) : 0;
    loaded = true;
    emit();
}

/** Clear local state (on logout). */
export async function clearStore(): Promise<void> {
    store = {};
    cursor = 0;
    dirty.clear();
    loaded = false;
    await Promise.all([AsyncStorage.removeItem(STORE_KEY), AsyncStorage.removeItem(CURSOR_KEY)]);
    emit();
}

export function dateKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function getEntry(date: string, hour: number): LocalEntry | undefined {
    const dek = getDEK();
    if (!dek) return undefined;
    const e = store[cellId(dek, date, hour)];
    return e && !e.deleted ? e : undefined;
}

/** All non-deleted entries currently in the local store (decrypted). */
export function getAllEntries(): LocalEntry[] {
    const out: LocalEntry[] = [];
    for (const id in store) {
        const e = store[id];
        if (!e.deleted) out.push(e);
    }
    return out;
}

/** Reactive view of every non-deleted entry; re-renders when the store changes. */
export function useEntries(): LocalEntry[] {
    const [entries, setEntries] = useState<LocalEntry[]>(getAllEntries);
    useEffect(() => {
        loadStore();
        return subscribeEntries(() => setEntries(getAllEntries()));
    }, []);
    return entries;
}

export interface HourSlot {
    date: string; // "YYYY-M-D"
    hour: number; // 0-23
}

/**
 * The completed hour blocks within the last `windowHours` that have no entry yet.
 * Oldest first. A block [t, t+1h) counts only once it has fully elapsed (t+1h <=
 * now), so the in-progress hour is never demanded. This replaces the old single
 * forward-only `lastSync` anchor, which skipped gaps and so falsely reported
 * "caught up". Bounded by the window, so an old import can't balloon the count.
 */
export function getUnloggedHours(windowHours: number, now: number): HourSlot[] {
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0); // start of the current (in-progress) hour
    const out: HourSlot[] = [];
    for (let i = windowHours; i >= 1; i--) {
        const t = new Date(hourStart.getTime() - i * HOUR_MS); // a fully-elapsed block start
        const date = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
        if (!getEntry(date, t.getHours())) out.push({ date, hour: t.getHours() });
    }
    return out;
}

/** Whether the local store has finished its initial load (vs. still empty). */
export function getStoreLoaded(): boolean {
    return loaded;
}

/** Reactive store-loaded flag, so callers can tell "loading" from "nothing here". */
export function useStoreLoaded(): boolean {
    const [v, setV] = useState(loaded);
    useEffect(() => {
        loadStore();
        return subscribeEntries(() => setV(getStoreLoaded()));
    }, []);
    return v;
}

/** Reactive unlogged-hours list; re-evaluates each hour and on store changes. */
export function useUnloggedHours(windowHours: number): HourSlot[] {
    const now = useDate("hourly");
    const [, force] = useState(0);
    useEffect(() => {
        loadStore();
        return subscribeEntries(() => force((n) => n + 1));
    }, []);
    return getUnloggedHours(windowHours, now.getTime());
}

/** Record (or overwrite) one hour's entry, then push it (debounced). Optimistic. */
export async function setEntry(
    date: string,
    hour: number,
    activity: number | null,
    feeling: number | null,
    source: "manual" | "health" = "manual",
): Promise<void> {
    const dek = getDEK();
    if (!dek) throw new Error("Locked: no decryption key");
    const id = cellId(dek, date, hour);
    store[id] = { date, hour, activity, feeling, source, updatedAt: Date.now(), deleted: false };
    dirty.add(id);
    emit();
    await persist();
    schedulePush();
}

function slotMs(date: string, hour: number): number {
    const [y, mo, d] = date.split("-").map(Number);
    return new Date(y, mo - 1, d, hour, 0, 0, 0).getTime();
}

/**
 * Bulk import (one metric per call). Merges with any existing cell so importing
 * activity then feeling for the same hour keeps both. `updatedAt` is the slot's
 * real time, so a genuine later manual edit always wins last-write-wins (import
 * never clobbers newer data, locally or on the server). Returns cells touched.
 */
export async function importEntries(
    items: { date: string; hour: number; activity?: number | null; feeling?: number | null }[],
): Promise<number> {
    const dek = getDEK();
    if (!dek) throw new Error("Locked: no decryption key");
    await loadStore();
    for (const it of items) {
        const id = cellId(dek, it.date, it.hour);
        const prev = store[id];
        const activity = it.activity !== undefined ? it.activity : (prev?.activity ?? null);
        const feeling = it.feeling !== undefined ? it.feeling : (prev?.feeling ?? null);
        const updatedAt = Math.max(slotMs(it.date, it.hour), prev?.updatedAt ?? 0);
        store[id] = { date: it.date, hour: it.hour, activity, feeling, source: "manual", updatedAt, deleted: false };
        dirty.add(id);
    }
    emit();
    await persist();
    schedulePush();
    return items.length;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
        pushTimer = null;
        push().catch(() => {/* stays dirty; retried on next sync */});
    }, 400);
}

// Editing custom activities marks the taxonomy dirty; push it on the same debounce.
subscribeTaxonomy(() => {
    if (taxonomyDirty()) schedulePush();
});

/** Push dirty cells (and the taxonomy config cell if edited). LWW on updatedAt. */
export async function push(): Promise<void> {
    const dek = getDEK();
    if (!dek) return;
    const ids = [...dirty];
    const records = ids.map((id) => {
        const e = store[id];
        const payload: EntryPayload = { date: e.date, hour: e.hour, activity: e.activity, feeling: e.feeling, source: e.source };
        const sealed = sealEntry(dek, payload);
        return { cellId: id, ciphertext: sealed.ciphertext, nonce: sealed.nonce, deleted: e.deleted, updatedAt: e.updatedAt };
    });
    const pushTaxonomy = taxonomyDirty();
    if (pushTaxonomy) records.push(taxonomySealedRecord(dek));
    if (records.length === 0) return;

    await trpc.entries.push.mutate({ records });
    for (const id of ids) dirty.delete(id);
    if (pushTaxonomy) markTaxonomyClean();
}

/** Push local changes, pull remote changes (LWW merge), advance the caught-up anchor. */
export async function sync(): Promise<void> {
    const dek = getDEK();
    if (!dek) return;
    await loadStore();
    await push();

    const res = await trpc.entries.pull.query({ since: cursor || undefined });
    const cfgId = configCellId(dek);
    let changed = false;
    for (const r of res.records) {
        // The taxonomy config rides the same table as one reserved cell; route it.
        if (r.cellId === cfgId) {
            if (applyPulledConfig(dek, r)) changed = true;
            continue;
        }
        const existing = store[r.cellId];
        if (existing && existing.updatedAt >= r.updatedAt) continue; // local is newer or equal
        try {
            const p = openEntry(dek, { ciphertext: r.ciphertext, nonce: r.nonce });
            store[r.cellId] = {
                date: p.date, hour: p.hour, activity: p.activity, feeling: p.feeling,
                source: p.source, updatedAt: r.updatedAt, deleted: r.deleted,
            };
            changed = true;
        } catch {/* skip undecryptable */}
    }
    cursor = res.cursor;
    if (changed) emit();
    await persist();
}
