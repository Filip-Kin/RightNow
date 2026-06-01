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
import {
    cellId, configCellId, noteCellId, openCell, sealEntry, sealNote,
    type EntryPayload, type NotePayload,
} from "./crypto";
import {
    applyPulledConfig, loadTaxonomy, markTaxonomyClean,
    subscribeTaxonomy, taxonomyDirty, taxonomySealedRecord,
} from "./activities";
import { dbLoadAll, dbFlush, dbClearAll, type DbEntry } from "./entryDb";

export interface LocalEntry {
    date: string; // "YYYY-M-D"
    hour: number; // 0-23
    activity: number | null;
    feeling: number | null;
    source: "manual" | "health";
    updatedAt: number; // epoch ms, logical clock for LWW
    deleted: boolean;
}

export interface LocalNote {
    text: string;
    updatedAt: number; // epoch ms, logical clock for LWW
}

// Legacy AsyncStorage keys (pre-SQLite). Removed on first load to reclaim space;
// the data is re-pulled from the server into SQLite.
const LEGACY_KEYS = ["rn_entries", "rn_notes", "rn_cursor"];
const HOUR_MS = 60 * 60 * 1000;

let store: Record<string, LocalEntry> = {}; // cellId -> entry
let notes: Record<string, LocalNote> = {}; // date "YYYY-M-D" -> note
let cursor = 0; // server receivedAt cursor for incremental pull
const dirty = new Set<string>(); // entry cellIds with un-pushed local changes
const noteDirty = new Set<string>(); // dates with un-pushed note changes
// Disk-write queues, drained by persist(). Separate from `dirty`/`noteDirty`
// (which track server pushes and clear independently): a pulled server change
// must be written to disk even though it isn't "dirty" to push back.
const diskEntries = new Set<string>(); // cellIds whose row needs (re)writing
const diskNotes = new Set<string>(); // dates whose note row needs writing/deleting
let diskCursor = false; // cursor changed and needs writing
let loaded = false;

const listeners = new Set<() => void>();
function emit() {
    for (const l of listeners) l();
}

export function subscribeEntries(fn: () => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

/** Flush queued row changes to SQLite. Drains the disk queues; reads each row's
 *  current state from the in-memory store so we always write the latest value. */
async function persist() {
    if (!diskEntries.size && !diskNotes.size && !diskCursor) return;
    const eids = [...diskEntries]; diskEntries.clear();
    const ndates = [...diskNotes]; diskNotes.clear();
    const cflag = diskCursor; diskCursor = false;

    const entries: DbEntry[] = [];
    for (const id of eids) {
        const e = store[id];
        if (e) entries.push({ cellId: id, date: e.date, hour: e.hour, activity: e.activity, feeling: e.feeling, source: e.source, updatedAt: e.updatedAt, deleted: e.deleted });
    }
    const noteUpserts: { date: string; text: string; updatedAt: number }[] = [];
    const noteDeletes: string[] = [];
    for (const d of ndates) {
        const n = notes[d];
        if (n) noteUpserts.push({ date: d, text: n.text, updatedAt: n.updatedAt });
        else noteDeletes.push(d);
    }
    await dbFlush({ entries, notes: noteUpserts, deleteNotes: noteDeletes, cursor: cflag ? cursor : null });
}

export async function loadStore(): Promise<void> {
    if (loaded) return;
    // Drop the old oversized AsyncStorage blobs (safe even when unreadable -
    // removeItem deletes by key without reading the value).
    AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => {});
    try {
        const [all] = await Promise.all([dbLoadAll(), loadTaxonomy()]);
        store = {};
        for (const e of all.entries) {
            store[e.cellId] = { date: e.date, hour: e.hour, activity: e.activity, feeling: e.feeling, source: e.source as "manual" | "health", updatedAt: e.updatedAt, deleted: e.deleted };
        }
        notes = {};
        for (const n of all.notes) notes[n.date] = { text: n.text, updatedAt: n.updatedAt };
        cursor = all.cursor;
    } catch (e) {
        // Don't hang the app if the DB can't open (e.g. a misconfigured web build);
        // start empty - sync will try to repopulate from the server.
        store = {};
        notes = {};
        cursor = 0;
    }
    loaded = true;
    emit();
}

/** Clear local state (on logout). */
export async function clearStore(): Promise<void> {
    store = {};
    notes = {};
    cursor = 0;
    dirty.clear();
    noteDirty.clear();
    diskEntries.clear();
    diskNotes.clear();
    diskCursor = false;
    loaded = false;
    await dbClearAll();
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

/** Whether an hour counts as logged for catch-up purposes: it has a cell with an
 *  activity OR a feeling. A cleared cell (both null) is treated as still unlogged,
 *  so clearing an hour re-surfaces it in the "to log" count. */
export function isHourLogged(date: string, hour: number): boolean {
    const e = getEntry(date, hour);
    return !!e && (e.activity !== null || e.feeling !== null);
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

// #region per-day notes
export function getNote(date: string): string | undefined {
    const n = notes[date];
    return n && n.text ? n.text : undefined;
}

/** Map of date -> note text (only non-empty notes), for the grid. */
export function getNotes(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d in notes) if (notes[d].text) out[d] = notes[d].text;
    return out;
}

/** Set (or clear, when text is empty) a day's note, then push it (debounced). */
export async function setNote(date: string, text: string): Promise<void> {
    notes[date] = { text, updatedAt: Date.now() };
    noteDirty.add(date);
    diskNotes.add(date);
    emit();
    await persist();
    schedulePush();
}

/** Reactive map of date -> note text; re-renders when notes change. */
export function useNotes(): Record<string, string> {
    const [v, setV] = useState<Record<string, string>>(getNotes);
    useEffect(() => {
        loadStore();
        return subscribeEntries(() => setV(getNotes()));
    }, []);
    return v;
}
// #endregion

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
        if (!isHourLogged(date, t.getHours())) out.push({ date, hour: t.getHours() });
    }
    return out;
}

/**
 * How many consecutive most-recent fully-elapsed hours have no entry, capped at
 * `cap`. This is the "you're N hours behind" streak driving the hourly nudge.
 * Returns 0 when locked (no DEK) so we never escalate on undecryptable data.
 */
export function trailingUnloggedStreak(cap: number, now: number): number {
    if (!getDEK()) return 0;
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0); // start of the current (in-progress) hour
    let streak = 0;
    for (let i = 1; i <= cap; i++) {
        const t = new Date(hourStart.getTime() - i * HOUR_MS);
        const date = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
        if (isHourLogged(date, t.getHours())) break;
        streak++;
    }
    return streak;
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
    diskEntries.add(id);
    emit();
    await persist();
    schedulePush();
}

/**
 * Auto-fill the given hours with the Sleep activity from a Health read. Only
 * touches hours with no logged data - a manual entry (or any non-health entry)
 * is left alone. Prior health fills are re-labelled if the sleep activity index
 * changed. updatedAt is the slot's real time so a later manual edit always wins
 * LWW (locally and on the server). Returns the number of cells changed.
 */
export async function fillHealthSleep(
  slots: { date: string; hour: number }[],
  activityIndex: number,
): Promise<number> {
  const dek = getDEK();
  if (!dek) throw new Error("Locked: no decryption key");
  await loadStore();
  let changed = 0;
  for (const { date, hour } of slots) {
    const id = cellId(dek, date, hour);
    const prev = store[id];
    // Never overwrite a manual entry; skip a health fill that's already correct.
    if (prev && !prev.deleted && prev.source !== "health") continue;
    if (prev && !prev.deleted && prev.source === "health" && prev.activity === activityIndex) continue;
    store[id] = {
      date, hour, activity: activityIndex, feeling: null,
      source: "health", updatedAt: slotMs(date, hour), deleted: false,
    };
    dirty.add(id);
    diskEntries.add(id);
    changed++;
  }
  if (changed) {
    emit();
    await persist();
    schedulePush();
  }
  return changed;
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
        diskEntries.add(id);
    }
    emit();
    await persist();
    schedulePush();
    return items.length;
}

/** Bulk import day notes (used by CSV import). Day-real-time updatedAt so manual edits win. */
export async function importNotes(items: { date: string; note: string }[]): Promise<number> {
    const dek = getDEK();
    if (!dek) throw new Error("Locked: no decryption key");
    await loadStore();
    let n = 0;
    for (const it of items) {
        if (!it.note) continue;
        const updatedAt = Math.max(slotMs(it.date, 0), notes[it.date]?.updatedAt ?? 0);
        notes[it.date] = { text: it.note, updatedAt };
        noteDirty.add(it.date);
        diskNotes.add(it.date);
        n++;
    }
    emit();
    await persist();
    schedulePush();
    return n;
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

// The server caps each push at 500 records, so a large import (years of hourly
// cells) must go up in batches - sending them all at once was silently rejected.
const PUSH_CHUNK = 500;
let pushing = false;

interface PushRecord { cellId: string; ciphertext: string; nonce: string; deleted: boolean; updatedAt: number }

/**
 * Push dirty cells (+ dirty notes + the taxonomy config cell) in <=500-record
 * batches; each batch's dirty flags clear only on its success, so a failure just
 * leaves the rest to retry. LWW on updatedAt server-side. `onProgress(sent,total)`
 * lets a restore show a progress bar. Re-entrancy-guarded.
 */
export async function push(onProgress?: (sent: number, total: number) => void): Promise<void> {
    const dek = getDEK();
    if (!dek || pushing) return;
    pushing = true;
    try {
        const items: { record: PushRecord; clear: () => void }[] = [];
        for (const id of [...dirty]) {
            const e = store[id];
            const sealed = sealEntry(dek, { date: e.date, hour: e.hour, activity: e.activity, feeling: e.feeling, source: e.source });
            items.push({ record: { cellId: id, ciphertext: sealed.ciphertext, nonce: sealed.nonce, deleted: e.deleted, updatedAt: e.updatedAt }, clear: () => dirty.delete(id) });
        }
        for (const d of [...noteDirty]) {
            const n = notes[d];
            const sealed = sealNote(dek, { date: d, note: n.text });
            items.push({ record: { cellId: noteCellId(dek, d), ciphertext: sealed.ciphertext, nonce: sealed.nonce, deleted: !n.text, updatedAt: n.updatedAt }, clear: () => noteDirty.delete(d) });
        }
        if (taxonomyDirty()) {
            items.push({ record: taxonomySealedRecord(dek), clear: () => markTaxonomyClean() });
        }
        if (items.length === 0) return;

        onProgress?.(0, items.length);
        for (let i = 0; i < items.length; i += PUSH_CHUNK) {
            const slice = items.slice(i, i + PUSH_CHUNK);
            await trpc.entries.push.mutate({ records: slice.map((x) => x.record) });
            for (const x of slice) x.clear();
            onProgress?.(Math.min(i + slice.length, items.length), items.length);
        }
    } finally {
        pushing = false;
    }
}

// #region sync status (surfaced in Settings + drives the sync-failure notification)
export type SyncStatus = "idle" | "syncing" | "ok" | "offline" | "error";
let syncStatus: SyncStatus = "idle";
let lastSyncAt = 0;
const syncListeners = new Set<() => void>();
let onSyncStatusChange: ((s: SyncStatus) => void) | null = null;

function setSyncStatus(s: SyncStatus) {
    syncStatus = s;
    if (s === "ok") lastSyncAt = Date.now();
    for (const l of syncListeners) l();
    onSyncStatusChange?.(s);
}

export function getSyncStatus(): { status: SyncStatus; lastSyncAt: number } {
    return { status: syncStatus, lastSyncAt };
}
export function subscribeSyncStatus(fn: () => void): () => void {
    syncListeners.add(fn);
    return () => void syncListeners.delete(fn);
}
/** Reactive sync status for the Settings indicator. */
export function useSyncStatus(): { status: SyncStatus; lastSyncAt: number } {
    const [v, setV] = useState(getSyncStatus);
    useEffect(() => subscribeSyncStatus(() => setV(getSyncStatus())), []);
    return v;
}
/** notification.ts registers here (callback avoids a circular import). */
export function setSyncStatusListener(fn: (s: SyncStatus) => void) {
    onSyncStatusChange = fn;
}

// "error" = the server is reachable but rejecting us (e.g. invalid session) - a real
// problem to surface. "offline" = no connectivity - stay quiet, it'll retry.
function classifySyncError(e: unknown): SyncStatus {
    if (typeof navigator !== "undefined" && (navigator as { onLine?: boolean }).onLine === false) return "offline";
    const httpStatus = (e as { data?: { httpStatus?: number } })?.data?.httpStatus;
    if (httpStatus === 401 || httpStatus === 403) return "error";
    const msg = String((e as { message?: string })?.message ?? "");
    if (/fetch|network|failed to fetch|timeout|econn/i.test(msg)) return "offline";
    return "error";
}
// #endregion

/** Push local changes, pull remote changes (LWW merge). Never throws; updates sync
 *  status. `onProgress(done,total)` reports the pull+decrypt phase (the slow part on
 *  a fresh device) so a sign-in screen can show a download bar. */
export async function sync(onProgress?: (done: number, total: number) => void): Promise<void> {
    const dek = getDEK();
    if (!dek) return;
    setSyncStatus("syncing");
    try {
    await loadStore();
    await push();

    const res = await trpc.entries.pull.query({ since: cursor || undefined });
    const cfgId = configCellId(dek);
    const total = res.records.length;
    onProgress?.(0, total);
    let changed = false;
    let processed = 0;
    for (const r of res.records) {
        processed++;
        // Yield every so often so a big decrypt loop doesn't freeze the UI and the
        // progress bar can repaint.
        if (processed % 250 === 0) {
            onProgress?.(processed, total);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        // The taxonomy config rides the same table as one reserved cell; route it.
        if (r.cellId === cfgId) {
            if (applyPulledConfig(dek, r)) changed = true;
            continue;
        }
        let p: EntryPayload | NotePayload;
        try {
            p = openCell(dek, { ciphertext: r.ciphertext, nonce: r.nonce });
        } catch {
            continue; // skip undecryptable
        }
        if ("hour" in p) {
            const existing = store[r.cellId];
            if (existing && existing.updatedAt >= r.updatedAt) continue; // local newer or equal
            store[r.cellId] = {
                date: p.date, hour: p.hour, activity: p.activity, feeling: p.feeling,
                source: p.source, updatedAt: r.updatedAt, deleted: r.deleted,
            };
            diskEntries.add(r.cellId);
            changed = true;
        } else {
            const existing = notes[p.date];
            if (existing && existing.updatedAt >= r.updatedAt) continue;
            if (r.deleted || !p.note) delete notes[p.date];
            else notes[p.date] = { text: p.note, updatedAt: r.updatedAt };
            diskNotes.add(p.date);
            changed = true;
        }
    }
    cursor = res.cursor;
    diskCursor = true;
    onProgress?.(total, total);
    if (changed) emit();
    await persist();
    setSyncStatus("ok");
    } catch (e) {
        // Surface the failure via status; callers .catch() this no-op throw anyway.
        setSyncStatus(classifySyncError(e));
    }
}
