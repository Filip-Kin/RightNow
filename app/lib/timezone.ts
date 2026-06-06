// Timezone-change detection + orchestration. The pure math lives in transit.ts;
// this module owns the persisted state, decides when to blend silently vs prompt,
// and writes the resampled transit into the grid.
//
// State is a small plaintext file (the offset + an observation timestamp are timing
// metadata, not secret - same stance as quicklog-filled.json). It must be readable
// before the DEK exists (the offset compare needs no key); only the actual entry
// writes need the key, so a resolution computed while locked is deferred and
// replayed on the next foreground once getDEK() succeeds.
import { useEffect, useState } from "react";
import { getDEK } from "./auth";
import { getConfig } from "./config";
import { markFilled, getToAsk } from "./filledHours";
import {
  fillTransit, clearTransit, getTransitCells, transitCellAt, importEntries,
} from "./entries";
import {
  classify, measuredSpanHours, resampleTransit, transitSlots,
  type Classification, type TransitCell,
} from "./transit";

// Lazy expo-file-system import (pulls react-native; keep it out of the test path).
type FileMod = typeof import("expo-file-system");
let fileMod: FileMod | null = null;
async function fs(): Promise<FileMod> {
  return (fileMod ??= await import("expo-file-system"));
}

const STATE_FILE = "quicklog-tzstate.json";
const MIN = 60 * 1000;

interface PendingTravel {
  deltaMin: number;
  detectedAtMs: number; // ~ arrival (clock changed on landing) or takeoff (clock set early)
  fromOffsetMin: number; // offset before the jump
  toOffsetMin: number; // offset after the jump
  baselineAtMs: number; // last pre-trip observation (window start anchor)
}

interface ActiveTrip {
  startAbsMs: number; // last pre-trip observation
  fromOffsetMin: number;
  startedAtMs: number;
}

interface TzState {
  lastOffsetMin: number | null; // east-positive; null = first run
  lastObservedAtMs: number;
  pending: PendingTravel | null; // flight detected, awaiting the prompt answer
  trip: ActiveTrip | null; // user chose "I'm flying" -> live transit mode
  pendingFill: { baselineAtMs: number; baselineOffsetMin: number } | null; // deferred (was locked)
}

let state: TzState | null = null;
let loaded = false;

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }
export function subscribeTz(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function blank(): TzState {
  return { lastOffsetMin: null, lastObservedAtMs: 0, pending: null, trip: null, pendingFill: null };
}

async function load(): Promise<TzState> {
  if (loaded && state) return state;
  try {
    const { File, Paths } = await fs();
    const f = new File(Paths.document, STATE_FILE);
    state = f.exists ? ({ ...blank(), ...(JSON.parse((await f.text()) || "{}") as Partial<TzState>) }) : blank();
  } catch {
    state = blank();
  }
  loaded = true;
  return state;
}

function save(): void {
  const snapshot = JSON.stringify(state);
  void (async () => {
    try {
      const { File, Paths } = await fs();
      const f = new File(Paths.document, STATE_FILE);
      if (!f.exists) f.create();
      f.write(snapshot);
    } catch { /* best-effort; reloaded next foreground */ }
  })();
  emit();
}

/** Device offset in minutes, east-positive (UTC+13 -> +780). */
export function currentOffsetMin(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}

/** A wall-clock "local epoch" (real ms + offset). Differences between two of these
 *  give the local-grid span, which bakes in any offset change (= realElapsed + delta). */
function localPseudoMs(absMs: number, offsetMin: number): number {
  return absMs + offsetMin * MIN;
}

function tzEnabled(): boolean {
  return getConfig()?.timezoneHandlingEnabled ?? true;
}

function capHours(): number {
  return getConfig()?.catchUpWindowHours ?? 24;
}

export interface DetectResult {
  kind: Classification | "none";
  deltaMin: number;
  needsPrompt: boolean;
}

/**
 * Compare the device offset to the stored baseline and act:
 * - first run / no change -> refresh the baseline, nothing else.
 * - sub-hour shift / fall-back -> no-op (LWW handles a repeated hour).
 * - +1h (DST spring-forward / east ground crossing) -> silently fill the skipped hour.
 * - >=90min -> a flight: stash a pending-travel record (for the prompt) and, on a
 *   forward jump, immediately hold the displaced gap in the shared ledger so no
 *   surface phantom-nags it before the user answers.
 * Always advances the stored offset so we don't re-detect the same jump.
 */
export async function detectTimezoneChange(now: number = Date.now()): Promise<DetectResult> {
  const s = await load();
  const cur = currentOffsetMin();

  if (s.lastOffsetMin === null) {
    s.lastOffsetMin = cur; s.lastObservedAtMs = now; save();
    return { kind: "none", deltaMin: 0, needsPrompt: false };
  }
  if (cur === s.lastOffsetMin) {
    // Keep the baseline fresh (the "arrived" window starts from the last time the
    // app was open), but never while a trip/pending is in flight.
    if (!s.pending && !s.trip) { s.lastObservedAtMs = now; save(); }
    return { kind: "none", deltaMin: 0, needsPrompt: false };
  }

  const deltaMin = cur - s.lastOffsetMin;
  const baselineAtMs = s.lastObservedAtMs;
  const baselineOffsetMin = s.lastOffsetMin;
  const kind = tzEnabled() ? classify(deltaMin) : "noop";

  // Advance the baseline regardless so the jump isn't re-detected next foreground.
  s.lastOffsetMin = cur;
  s.lastObservedAtMs = now;

  if (kind === "flight") {
    s.pending = { deltaMin, detectedAtMs: now, fromOffsetMin: baselineOffsetMin, toOffsetMin: cur, baselineAtMs };
    if (deltaMin > 0) holdForwardGap(now, deltaMin); // suppress phantom backlog until resolved
    save();
    return { kind, deltaMin, needsPrompt: true };
  }
  if (kind === "blendForward") {
    blendForward(now, deltaMin); // best-effort silent fill of the skipped hour(s)
    save();
    return { kind, deltaMin, needsPrompt: false };
  }
  // blendBackward (repeated hour: LWW handles it) and noop.
  save();
  return { kind, deltaMin, needsPrompt: false };
}

/** Mark the east-bound displaced gap filled so the overlay/watch/app stop asking
 *  for the skipped local hours. Plaintext-only (no DEK), replaced with content at
 *  resolution. */
function holdForwardGap(now: number, deltaMin: number): void {
  const slots = transitSlots(now, Math.min(capHours(), Math.round(deltaMin / 60)));
  for (const { date, hour } of slots) markFilled(date, hour);
}

/** DST spring-forward / +1h ground crossing: fill the skipped hour(s) by copying the
 *  next logged hour (Filip's rule), bounded to the jump size so a real backlog is
 *  never mass-filled. Silent. Needs the DEK to copy content; otherwise just suppresses
 *  the phantom via markFilled. */
function blendForward(now: number, deltaMin: number): void {
  const count = Math.max(1, Math.round(deltaMin / 60));
  // Candidate skipped hours: the most-recent unfilled, fully-elapsed local hours.
  const unfilled = getToAsk(now, count + 2).slice(-count);
  for (const { date, hour } of unfilled) {
    const next = transitCellAt(date, hour + 1 > 23 ? 0 : hour + 1); // best-effort neighbor
    if (next && getDEK()) {
      void importEntries([{ date, hour, activity: next.activity, feeling: next.feeling }]);
    } else {
      markFilled(date, hour); // at least kill the phantom
    }
  }
}

// #region travel prompt resolution
export type TravelAnswer = "flying" | "arrived" | "landed" | "drove";

export async function resolveTravel(answer: TravelAnswer, now: number = Date.now()): Promise<void> {
  const s = await load();
  if (answer === "drove") {
    s.pending = null; s.trip = null; s.pendingFill = null; save();
    return;
  }
  if (answer === "flying") {
    // Enter live transit mode; resolve later via "I've landed".
    if (s.pending) {
      s.trip = { startAbsMs: s.pending.baselineAtMs, fromOffsetMin: s.pending.fromOffsetMin, startedAtMs: s.pending.detectedAtMs };
      s.pending = null; save();
    }
    return;
  }
  // "arrived" (no prior trip) or "landed" (ending an active trip): resolve now.
  const base = s.trip
    ? { at: s.trip.startAbsMs, off: s.trip.fromOffsetMin }
    : s.pending
      ? { at: s.pending.baselineAtMs, off: s.pending.fromOffsetMin }
      : null;
  if (!base) { save(); return; }

  if (!getDEK()) {
    // Locked: defer; replay on the next foreground with the key.
    s.pendingFill = { baselineAtMs: base.at, baselineOffsetMin: base.off };
    s.pending = null; s.trip = null; save();
    return;
  }
  await applyResolution(base.at, base.off, now);
  s.pending = null; s.trip = null; s.pendingFill = null; save();
}

/** Resample the trip's transit cells (or fill the gap with Transition when nothing
 *  was logged) into the now-relative grid window, floor of one Transition cell. */
async function applyResolution(baselineAtMs: number, baselineOffsetMin: number, now: number): Promise<void> {
  const startLocal = localPseudoMs(baselineAtMs, baselineOffsetMin);
  const nowLocal = localPseudoMs(now, currentOffsetMin());
  const span = measuredSpanHours(startLocal, nowLocal, capHours());

  const segment: TransitCell[] = getTransitCells().map((c) => ({ activity: c.activity, feeling: c.feeling }));
  const cells = resampleTransit(segment, span);

  // Clear the old transit positions (a re-resolve may have placed them differently),
  // then write the fresh resampled block ending at "now".
  await clearTransit(getTransitCells().map((c) => ({ date: c.date, hour: c.hour })));
  const slots = transitSlots(now, cells.length);
  await fillTransit(slots.map((sl, i) => ({ date: sl.date, hour: sl.hour, activity: cells[i].activity, feeling: cells[i].feeling })));
}

/** Replay a resolution that was deferred because the app was locked when the user
 *  answered. Call on foreground once the DEK is available. */
export async function drainPendingTz(now: number = Date.now()): Promise<void> {
  const s = await load();
  if (!s.pendingFill || !getDEK()) return;
  await applyResolution(s.pendingFill.baselineAtMs, s.pendingFill.baselineOffsetMin, now);
  s.pendingFill = null; save();
}
// #endregion

/** Manually start a trip (when auto-detection missed it, e.g. the clock was
 *  changed before the app was opened). The window starts at the last time the app
 *  was open. Resolve later with "I've landed". */
export async function beginManualTrip(now: number = Date.now()): Promise<void> {
  const s = await load();
  s.trip = { startAbsMs: s.lastObservedAtMs || now, fromOffsetMin: s.lastOffsetMin ?? currentOffsetMin(), startedAtMs: now };
  s.pending = null;
  save();
}

// #region reactive accessors
export function hasPendingTravel(): boolean {
  return !!state?.pending;
}
export function isTransitActive(): boolean {
  return !!state?.trip;
}
export function getPendingTravel(): PendingTravel | null {
  return state?.pending ?? null;
}

/** Re-renders when the tz state changes; returns { pending, transit }. */
export function useTzStatus(): { pending: boolean; transit: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    load().then(() => force((n) => n + 1));
    return subscribeTz(() => force((n) => n + 1));
  }, []);
  return { pending: hasPendingTravel(), transit: isTransitActive() };
}
// #endregion

// #region dev/test hooks
/** __DEV__-only: force a detection with an explicit delta (drive arrived/departing
 *  without physically changing zones). */
export async function __forceDetect(deltaMin: number, now: number = Date.now()): Promise<DetectResult> {
  const s = await load();
  if (s.lastOffsetMin === null) s.lastOffsetMin = currentOffsetMin();
  s.lastOffsetMin = currentOffsetMin() - deltaMin; // so cur - last == deltaMin
  s.lastObservedAtMs = now - 60 * MIN;
  save();
  return detectTimezoneChange(now);
}
// #endregion
