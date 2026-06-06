// Pure helpers for timezone-change handling. No native imports, so this is
// unit-testable like sleepFill.ts.
//
// RightNow's grid is local wall-clock: a slot's identity is (date "YYYY-M-D",
// hour 0-23). A device-timezone offset change distorts that grid (DST, or air
// travel). We keep the grid local always and reconcile travel by RESAMPLING
// whatever the user logged in transit to the number of grid slots the jump
// leaves - stretch flying east (more local slots than lived hours), compress
// flying west (fewer) - with a hard 1-hour "Transition" floor so a trip is never
// erased even when the grid can't hold it (the "arrived before you left" case).

const HOUR_MS = 60 * 60 * 1000;

/** Transition: the built-in travel activity (activities.tsx default index 10). */
export const TRANSITION_ACTIVITY = 10;

export interface TransitCell {
  activity: number | null;
  feeling: number | null;
}

/** The floor cell: one hour of Transition, no feeling. Travel always shows at
 *  least this, even when compression would otherwise round to zero. */
export const TRANSITION_CELL: TransitCell = { activity: TRANSITION_ACTIVITY, feeling: null };

export type Classification = "flight" | "blendForward" | "blendBackward" | "noop";

/**
 * Classify an offset change. `deltaMin` is east-positive: newOffset - oldOffset
 * where offset = -Date.getTimezoneOffset().
 * - |delta| >= 90min -> a flight (prompt + resample). Checked FIRST so a +120min
 *   jump is a flight, not a DST forward-fill.
 * - delta >= +60min  -> a whole local hour was skipped (DST spring-forward / an
 *   east ground crossing): fill the skipped slot silently.
 * - delta <= -60min  -> a local hour repeats (fall-back / west ground crossing):
 *   no-op; last-write-wins already handles the duplicate.
 * - otherwise (sub-hour shift, or 0) -> no-op: the clock moved within the hour,
 *   no whole slot was skipped.
 */
export function classify(deltaMin: number): Classification {
  if (Math.abs(deltaMin) >= 90) return "flight";
  if (deltaMin >= 60) return "blendForward";
  if (deltaMin <= -60) return "blendBackward";
  return "noop";
}

/**
 * How many grid slots the transit should fill, measured from the last pre-trip
 * instant to now in LOCAL time (the offset jump is baked into the wall-clock
 * delta, so this is `realElapsed + deltaOffset`). Capped so a stale baseline (app
 * not opened for days) can't request a huge fill; returns 0 when the local clock
 * went backward or didn't advance (west / date line) so the caller applies the
 * 1-hour Transition floor.
 */
export function measuredSpanHours(
  transitStartLocalMs: number,
  nowLocalMs: number,
  capHours: number,
): number {
  const raw = Math.floor((nowLocalMs - transitStartLocalMs) / HOUR_MS);
  if (raw <= 0) return 0;
  return Math.min(capHours, raw);
}

/**
 * Resample a transit segment (lived order) to `targetSlots` cells, preserving
 * proportional shape via nearest-neighbor (`src = floor(i * len / target)`):
 * stretches when target > length (each source cell repeats), compresses when
 * target < length (samples across). When the target collapses to <= 1, or the
 * segment is empty, returns exactly one Transition cell (the floor) rather than a
 * content sample, so "you were traveling" is always what a one-slot trip shows.
 */
export function resampleTransit(segment: TransitCell[], targetSlots: number): TransitCell[] {
  const n = Math.max(0, Math.round(targetSlots));
  if (n <= 1) return [{ ...TRANSITION_CELL }]; // the floor: one hour of Transition
  // No logged content (e.g. "I just arrived" filling an empty gap): default the
  // whole window to Transition rather than collapsing to a single cell.
  const seg = segment.length === 0 ? [TRANSITION_CELL] : segment;
  const out: TransitCell[] = [];
  for (let i = 0; i < n; i++) {
    out.push(seg[Math.floor((i * seg.length) / n)]);
  }
  return out;
}

/**
 * The `count` consecutive local hour-slots ENDING at the hour that contains
 * `endSlotMs` (so the transit window ends "now"), oldest first. Placement is
 * always now-relative - never anchored to the last pre-trip slot - so opening the
 * app days after a trip can't scatter cells across legitimately-empty days.
 */
export function transitSlots(endSlotMs: number, count: number): { date: string; hour: number }[] {
  const end = new Date(endSlotMs);
  end.setMinutes(0, 0, 0);
  const out: { date: string; hour: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(end.getTime() - i * HOUR_MS);
    out.push({ date: `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`, hour: t.getHours() });
  }
  return out;
}
