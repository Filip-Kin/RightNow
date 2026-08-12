// Deep catch-up logic: find the hours you still owe over a bounded look-back, split
// into an "activity" pass and a "mood" pass. Kept pure (no React/storage) so it's
// unit-testable; the screen is just presentation.
//
// The workflow it supports (Filip's): fill an ACTIVITY into every blank hour first
// (easier to remember what you were doing), THEN go back and fill a FEELING into the
// blanks - except hours whose activity is Sleep (or any skip-feeling activity), which
// intentionally have no mood. So the mood pass must be computed AFTER the activity
// pass, since filling an activity is what turns an hour into a mood gap.
import type { LocalEntry } from "./entries";

export type CatchUpNeed = "activity" | "mood";
export interface CatchUpSlot {
  date: string; // "YYYY-M-D"
  hour: number; // 0-23
  need: CatchUpNeed;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Local-time epoch ms for a (date "YYYY-M-D", hour) slot start. */
export function slotMs(date: string, hour: number): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, hour, 0, 0, 0).getTime();
}

interface Indexed {
  byDate: Map<string, Map<number, LocalEntry>>;
  firstDayMs: number | null; // start-of-day of the earliest logged hour (null = no data)
}

function indexEntries(entries: LocalEntry[]): Indexed {
  const byDate = new Map<string, Map<number, LocalEntry>>();
  let first = Infinity;
  for (const e of entries) {
    if (e.deleted) continue;
    let h = byDate.get(e.date);
    if (!h) { h = new Map(); byDate.set(e.date, h); }
    h.set(e.hour, e);
    const t = slotMs(e.date, e.hour);
    if (t < first) first = t;
  }
  let firstDayMs: number | null = null;
  if (Number.isFinite(first)) {
    const d = new Date(first); d.setHours(0, 0, 0, 0); firstDayMs = d.getTime();
  }
  return { byDate, firstDayMs };
}

/**
 * Walk every candidate slot: fully-elapsed hours from today back to
 * max(now - horizonDays, first-logged-day), newest day first. We never surface days
 * before you had any data (nothing was missed then) or hours that haven't elapsed.
 * Iterates by calendar day (setDate) so DST/month boundaries don't drift.
 */
function eachCandidateSlot(
  idx: Indexed,
  now: number,
  horizonDays: number,
  visit: (date: string, hour: number, entry: LocalEntry | undefined) => void,
): void {
  if (idx.firstDayMs == null) return;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const horizonStart = new Date(today); horizonStart.setDate(horizonStart.getDate() - (horizonDays - 1));
  const startMs = Math.max(horizonStart.getTime(), idx.firstDayMs);

  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    if (d.getTime() < startMs) break;
    const date = ymd(d);
    const hmap = idx.byDate.get(date);
    for (let hour = 0; hour < 24; hour++) {
      if (slotMs(date, hour) + HOUR_MS > now) continue; // not fully elapsed yet
      visit(date, hour, hmap?.get(hour));
    }
  }
}

const hasActivity = (e: LocalEntry | undefined): boolean => !!e && e.activity != null;

function chronological(slots: CatchUpSlot[]): CatchUpSlot[] {
  return slots.sort((a, b) => slotMs(a.date, a.hour) - slotMs(b.date, b.hour));
}

/** Elapsed hours in the window that have no activity yet (the activity pass), oldest first. */
export function activityGapSlots(entries: LocalEntry[], now: number, horizonDays: number): CatchUpSlot[] {
  const idx = indexEntries(entries);
  const out: CatchUpSlot[] = [];
  eachCandidateSlot(idx, now, horizonDays, (date, hour, e) => {
    if (!hasActivity(e)) out.push({ date, hour, need: "activity" });
  });
  return chronological(out);
}

/**
 * Elapsed hours in the window that have an activity but no feeling, excluding
 * skip-feeling activities like Sleep (the mood pass), oldest first. Recompute this
 * AFTER the activity pass so hours activitied during that pass are included.
 */
export function moodGapSlots(
  entries: LocalEntry[], now: number, horizonDays: number, isSkipFeeling: (activityIndex: number) => boolean,
): CatchUpSlot[] {
  const idx = indexEntries(entries);
  const out: CatchUpSlot[] = [];
  eachCandidateSlot(idx, now, horizonDays, (date, hour, e) => {
    if (!e || e.activity == null) return;      // needs an activity first
    if (isSkipFeeling(e.activity)) return;     // sleep etc.: mood intentionally blank
    if (e.feeling == null) out.push({ date, hour, need: "mood" });
  });
  return chronological(out);
}

/**
 * How many days in the window aren't fully filled out: any elapsed hour missing an
 * activity, or any non-skip-feeling hour missing a feeling, makes the day incomplete.
 */
export function incompleteDayCount(
  entries: LocalEntry[], now: number, horizonDays: number, isSkipFeeling: (activityIndex: number) => boolean,
): number {
  const idx = indexEntries(entries);
  const incomplete = new Set<string>();
  eachCandidateSlot(idx, now, horizonDays, (date, hour, e) => {
    if (!hasActivity(e)) { incomplete.add(date); return; }
    if (!isSkipFeeling(e!.activity!) && e!.feeling == null) incomplete.add(date);
  });
  return incomplete.size;
}
