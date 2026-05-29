// Local-first encrypted entry store. Holds the decrypted entries on-device (so
// the catch-up flow and any history render instantly and offline), encrypts on
// the way out, and syncs with the server via entries.push / entries.pull.
//
// The server only ever sees opaque cells. Each entry's payload (incl. date+hour)
// is encrypted; the cell_id is an HMAC, so a fresh device pulls everything and
// rebuilds this store by decrypting.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "./trpc";
import { getDEK } from "./auth";
import { setLastSyncAtLeast } from "./config";
import { cellId, openEntry, sealEntry, type EntryPayload } from "./crypto";

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
    const [s, c] = await Promise.all([AsyncStorage.getItem(STORE_KEY), AsyncStorage.getItem(CURSOR_KEY)]);
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

function entryStartMs(e: LocalEntry): number {
    const [y, mo, d] = e.date.split("-").map(Number);
    return new Date(y, mo - 1, d, e.hour, 0, 0, 0).getTime();
}

export function getEntry(date: string, hour: number): LocalEntry | undefined {
    const dek = getDEK();
    if (!dek) return undefined;
    const e = store[cellId(dek, date, hour)];
    return e && !e.deleted ? e : undefined;
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

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
        pushTimer = null;
        push().catch(() => {/* stays dirty; retried on next sync */});
    }, 400);
}

/** Push dirty cells. On success they're no longer dirty; on failure they remain. */
export async function push(): Promise<void> {
    const dek = getDEK();
    if (!dek || dirty.size === 0) return;
    const ids = [...dirty];
    const records = ids.map((id) => {
        const e = store[id];
        const payload: EntryPayload = { date: e.date, hour: e.hour, activity: e.activity, feeling: e.feeling, source: e.source };
        const sealed = sealEntry(dek, payload);
        return { cellId: id, ciphertext: sealed.ciphertext, nonce: sealed.nonce, deleted: e.deleted, updatedAt: e.updatedAt };
    });
    await trpc.entries.push.mutate({ records });
    for (const id of ids) dirty.delete(id);
}

/** Push local changes, pull remote changes (LWW merge), advance the caught-up anchor. */
export async function sync(): Promise<void> {
    const dek = getDEK();
    if (!dek) return;
    await loadStore();
    await push();

    const res = await trpc.entries.pull.query({ since: cursor || undefined });
    let changed = false;
    for (const r of res.records) {
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

    // Advance the "caught up through" anchor to the end of the latest logged hour.
    let latest = 0;
    for (const id in store) {
        const e = store[id];
        if (e.deleted) continue;
        const end = entryStartMs(e) + HOUR_MS;
        if (end > latest) latest = end;
    }
    if (latest > 0) setLastSyncAtLeast(latest);
}
