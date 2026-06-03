// The "what still needs filling" source of truth, shared by all three logging
// surfaces (in-app /log, the native overlay, and the watch).
//
// Why a separate plaintext ledger instead of deriving from the encrypted store:
// the overlay and watch have no decryption key, so they cannot read the store to
// learn which hours are logged. Instead, *every* surface records the (date,hour)
// of an hour the moment it's filled - no key needed, it's only timing metadata
// (already exposed to the server via cell_ids, and this file never leaves the
// device). All three then ask the same question: "which fully-elapsed hours in the
// last `windowHours` are NOT in this ledger?".
//
// The ledger is APPEND-and-age-trim only: a fill adds a key; the only removals are
// the 25h age-trim and an explicit clear (an hour blanked to no activity/feeling).
// Crucially it is NEVER rebuilt by *absence* from the store - so a transient store
// glitch (the old "jumped to 24 hours" bug) can't resurface an already-filled hour.
// entries.seedFilledFromStore() unions store-known fills in (seeding a fresh device
// and picking up hours logged on another device / the web app via sync); union-only
// keeps that safe.
//
// File: quicklog-filled.json in Paths.document (== Android context.filesDir), so the
// native Kotlin overlay reads/writes the exact same path + format: a JSON object
// mapping "YYYY-M-D|H" -> the hour-block's start epoch ms (the value is only used for
// the age-trim).
import { useEffect, useState } from "react";
import { useDate } from "./time";

// expo-file-system is loaded lazily (it pulls in react-native, which the unit-test
// runner can't parse). On-device Metro resolves the dynamic import fine.
type FileMod = typeof import("expo-file-system");
let fileMod: FileMod | null = null;
async function fs(): Promise<FileMod> {
  return (fileMod ??= await import("expo-file-system"));
}

const FILLED_FILE = "quicklog-filled.json";
const HOUR_MS = 60 * 60 * 1000;
const KEEP_MS = 25 * HOUR_MS; // keep a 1h buffer past the 24h ask window

export interface HourSlot {
  date: string; // "YYYY-M-D" (local)
  hour: number; // 0-23
}

let filled: Record<string, number> = {}; // "date|hour" -> slot start ms
let loaded = false;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
export function subscribeFilled(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function keyOf(date: string, hour: number): string {
  return `${date}|${hour}`;
}

export function slotMs(date: string, hour: number): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, hour, 0, 0, 0).getTime();
}

function persist(): void {
  const snapshot = JSON.stringify(filled);
  void (async () => {
    try {
      const { File, Paths } = await fs();
      const f = new File(Paths.document, FILLED_FILE);
      if (!f.exists) f.create();
      f.write(snapshot);
    } catch {
      /* best-effort; reloaded from disk next foreground */
    }
  })();
}

/** Load the ledger from disk into memory (idempotent). */
export async function loadFilled(): Promise<void> {
  if (loaded) return;
  await reloadFilled();
  loaded = true;
}

/** Force a re-read from disk - call on foreground and after a drain, since the
 *  native overlay (a separate process) may have appended while we were away. */
export async function reloadFilled(): Promise<void> {
  try {
    const { File, Paths } = await fs();
    const f = new File(Paths.document, FILLED_FILE);
    filled = f.exists ? ((JSON.parse((await f.text()) || "{}") as Record<string, number>) ?? {}) : {};
  } catch {
    filled = {};
  }
  loaded = true;
  emit();
}

/** Mark an hour filled (union). No-op if already present with the same slot time. */
export function markFilled(date: string, hour: number): void {
  const k = keyOf(date, hour);
  if (filled[k]) return;
  filled[k] = slotMs(date, hour);
  persist();
  emit();
}

/** Un-mark an hour (only when it's been explicitly blanked to no activity/feeling). */
export function clearFilled(date: string, hour: number): void {
  const k = keyOf(date, hour);
  if (!(k in filled)) return;
  delete filled[k];
  persist();
  emit();
}

export function isFilled(date: string, hour: number): boolean {
  return !!filled[keyOf(date, hour)];
}

/** Drop entries older than the keep window so the file can't grow unbounded. */
export function trimFilled(now: number = Date.now()): void {
  const cutoff = now - KEEP_MS;
  let changed = false;
  for (const k in filled) {
    if (filled[k] < cutoff) {
      delete filled[k];
      changed = true;
    }
  }
  if (changed) {
    persist();
    emit();
  }
}

/**
 * The fully-elapsed hours within the last `windowHours` that aren't in the ledger,
 * oldest first. A block [t, t+1h) counts only once it has fully elapsed, so the
 * in-progress hour is never demanded. This is what every surface asks for.
 */
export function getToAsk(now: number, windowHours: number): HourSlot[] {
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0); // start of the current (in-progress) hour
  const out: HourSlot[] = [];
  for (let i = windowHours; i >= 1; i--) {
    const t = new Date(hourStart.getTime() - i * HOUR_MS); // a fully-elapsed block start
    const date = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
    if (!filled[keyOf(date, t.getHours())]) out.push({ date, hour: t.getHours() });
  }
  return out;
}

/** Test-only: reset the in-memory ledger without touching disk. */
export function __resetForTest(): void {
  filled = {};
  loaded = true;
}

/** Reactive to-ask list; re-evaluates each hour and whenever the ledger changes. */
export function useToAsk(windowHours: number): HourSlot[] {
  const now = useDate("hourly");
  const [, force] = useState(0);
  useEffect(() => {
    loadFilled();
    return subscribeFilled(() => force((n) => n + 1));
  }, []);
  return getToAsk(now.getTime(), windowHours);
}
