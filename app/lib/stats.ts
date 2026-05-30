// Insights analytics, faithfully replicating the original WAYDRN spreadsheet's
// mood model. Kept pure (no React, no storage) so it's unit-testable and the
// Insights screen is just presentation.
//
// Two ideas from the sheet:
//   1. Weighting  - the raw 0-5 feeling scale is remapped onto a non-linear curve
//      (MOOD_WEIGHTS). The bottom is crushed (Poor ~= Terrible), the middle spread
//      wide, the top saturated (Good ~= Great). Matches 'Weighted Mood'!C2 and the
//      weighted average in 'Data Analysis'!C27.
//   2. Decay      - over the chronological timeline, a trailing moving average with
//      a 3-point window smooths hour-to-hour jitter (Rolling Average Weighted Mood /
//      Mood Chart!G). It ramps up at the very start (1 point, then 2, then 3).
import type { LocalEntry } from "./entries";

// #region mood model
/** feeling index (0 Terrible .. 5 Great) -> weighted value. From the sheet. */
export const MOOD_WEIGHTS = [0, 0.25, 1.5, 3.5, 4.75, 5] as const;
export const MOOD_MIN = MOOD_WEIGHTS[0];
export const MOOD_MAX = MOOD_WEIGHTS[MOOD_WEIGHTS.length - 1];

/** Remap a raw feeling (0-5) onto the weighted curve. */
export function weightedMood(feeling: number): number {
  return MOOD_WEIGHTS[feeling] ?? 0;
}

/** Weighted average mood of a set of raw feelings, or null if none. ('Data Analysis'!C27) */
export function weightedAvgMood(feelings: number[]): number | null {
  if (feelings.length === 0) return null;
  let sum = 0;
  for (const f of feelings) sum += weightedMood(f);
  return sum / feelings.length;
}

/**
 * Trailing moving average over a series where `null` marks a gap (an unlogged
 * hour/day). Each output keeps the input's shape: a null slot stays null (no
 * point), a value slot becomes the average of the non-null values within the
 * trailing `window` cells (itself + up to window-1 predecessors). Mirrors the
 * sheet's AVERAGE(C,D,E), which silently ignores blank cells.
 */
export function trailingMovingAverage(series: (number | null)[], window = 3): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < series.length; i++) {
    if (series[i] == null) { out.push(null); continue; }
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = series[j];
      if (v != null) { sum += v; n += 1; }
    }
    out.push(n > 0 ? sum / n : null);
  }
  return out;
}
// #endregion

// #region time helpers
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/** Epoch ms for a (date "YYYY-M-D", hour) slot in local time. */
export function slotMs(date: string, hour: number): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, hour, 0, 0, 0).getTime();
}

/** Local midnight `daysBack` days before `now`. */
function startOfDay(now: number, daysBack = 0): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime() - daysBack * DAY_MS;
}

/** Entries whose slot falls within the last `rangeDays` (today + previous days). */
export function entriesInRange(entries: LocalEntry[], rangeDays: number, now: number): LocalEntry[] {
  const cutoff = startOfDay(now, rangeDays - 1);
  return entries.filter((e) => slotMs(e.date, e.hour) >= cutoff);
}
// #endregion

// #region aggregates
export interface ActivitySlice {
  activity: number;
  hours: number;
  fraction: number; // 0..1 of logged-activity hours
}

/** Hours per activity over the given entries, as donut slices (desc by hours). */
export function activityDistribution(entries: LocalEntry[]): ActivitySlice[] {
  const counts = new Map<number, number>();
  let total = 0;
  for (const e of entries) {
    if (e.activity == null) continue;
    counts.set(e.activity, (counts.get(e.activity) ?? 0) + 1);
    total += 1;
  }
  const slices: ActivitySlice[] = [];
  for (const [activity, hours] of counts) {
    slices.push({ activity, hours, fraction: total ? hours / total : 0 });
  }
  slices.sort((a, b) => b.hours - a.hours);
  return slices;
}

export interface ActivityMood {
  activity: number;
  mood: number; // weighted avg
  hours: number; // rated hours that fed the average
}

/** Weighted-average mood per activity (only hours that have a feeling), desc by mood. */
export function avgMoodByActivity(entries: LocalEntry[]): ActivityMood[] {
  const byAct = new Map<number, number[]>();
  for (const e of entries) {
    if (e.activity == null || e.feeling == null) continue;
    const arr = byAct.get(e.activity) ?? [];
    arr.push(e.feeling);
    byAct.set(e.activity, arr);
  }
  const out: ActivityMood[] = [];
  for (const [activity, feels] of byAct) {
    const mood = weightedAvgMood(feels);
    if (mood != null) out.push({ activity, mood, hours: feels.length });
  }
  out.sort((a, b) => b.mood - a.mood);
  return out;
}

export interface HourOfDayStat {
  hour: number; // 0-23
  topActivity: number | null; // most common activity that hour-of-day
  mood: number | null; // weighted avg mood that hour-of-day
}

/** Per hour-of-day (0-23): most common activity and average mood across the range. */
export function byTimeOfDay(entries: LocalEntry[]): HourOfDayStat[] {
  const actCounts: Map<number, number>[] = Array.from({ length: 24 }, () => new Map());
  const feels: number[][] = Array.from({ length: 24 }, () => []);
  for (const e of entries) {
    if (e.activity != null) {
      const m = actCounts[e.hour];
      m.set(e.activity, (m.get(e.activity) ?? 0) + 1);
    }
    if (e.feeling != null) feels[e.hour].push(e.feeling);
  }
  return Array.from({ length: 24 }, (_, hour) => {
    let topActivity: number | null = null, top = 0;
    for (const [act, n] of actCounts[hour]) if (n > top) { top = n; topActivity = act; }
    return { hour, topActivity, mood: weightedAvgMood(feels[hour]) };
  });
}

export interface ActivityHourHeat {
  activity: number;
  counts: number[]; // 24, how often this activity happened at each hour-of-day
  total: number;
  max: number; // peak hour count (for per-row intensity scaling)
}

/**
 * For each activity, how often it occurs at every hour of the day (a heatmap).
 * Rows sorted by total hours desc; `max` lets the UI scale each row's intensity
 * to its own peak so an activity's daily rhythm is visible regardless of volume.
 */
export function activityByHourOfDay(entries: LocalEntry[]): ActivityHourHeat[] {
  const m = new Map<number, number[]>();
  for (const e of entries) {
    if (e.activity == null) continue;
    let arr = m.get(e.activity);
    if (!arr) { arr = new Array(24).fill(0); m.set(e.activity, arr); }
    arr[e.hour] += 1;
  }
  const out: ActivityHourHeat[] = [];
  for (const [activity, counts] of m) {
    let total = 0, max = 0;
    for (const n of counts) { total += n; if (n > max) max = n; }
    out.push({ activity, counts, total, max });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

export interface DayMood {
  date: string; // "YYYY-M-D"
  mood: number; // daily weighted avg
  hours: (LocalEntry | undefined)[]; // 24, for the expandable full-day row
}

/** Days ranked by daily weighted-average mood (best first). ('Data Analysis'!C27) */
export function bestDays(entries: LocalEntry[], limit = 5): DayMood[] {
  const feelsByDay = new Map<string, number[]>();
  const hoursByDay = new Map<string, (LocalEntry | undefined)[]>();
  for (const e of entries) {
    let row = hoursByDay.get(e.date);
    if (!row) { row = new Array(24).fill(undefined); hoursByDay.set(e.date, row); }
    row[e.hour] = e;
    if (e.feeling == null) continue;
    const arr = feelsByDay.get(e.date) ?? [];
    arr.push(e.feeling);
    feelsByDay.set(e.date, arr);
  }
  const days: DayMood[] = [];
  for (const [date, feels] of feelsByDay) {
    const mood = weightedAvgMood(feels);
    if (mood != null) days.push({ date, mood, hours: hoursByDay.get(date)! });
  }
  days.sort((a, b) => b.mood - a.mood || slotMs(b.date, 0) - slotMs(a.date, 0));
  return days.slice(0, limit);
}
// #endregion

// #region mood line series (weighting + decay)
export interface MoodPoint {
  t: number; // epoch ms (for ordering / axis labels)
  value: number; // smoothed weighted mood
}

export interface MoodSeries {
  points: MoodPoint[];
  granularity: "hour" | "day";
}

/**
 * The smoothed weighted-mood line for the line graph. Short ranges (<= 30d) plot
 * the hourly series for fine detail; longer ranges aggregate to one daily
 * weighted-average per day (a year of hourly points is unreadable). Either way the
 * 3-point trailing moving average ("decay") is applied over the chronological
 * grid, so gaps in logging don't fabricate a flat line.
 */
export function moodLineSeries(entries: LocalEntry[], rangeDays: number, now: number): MoodSeries {
  const granularity: "hour" | "day" = rangeDays <= 30 ? "hour" : "day";
  const inRange = entriesInRange(entries, rangeDays, now);

  if (granularity === "hour") {
    const start = startOfDay(now, rangeDays - 1);
    const slots = Math.ceil((now - start) / HOUR_MS) + 1;
    const raw: (number | null)[] = new Array(slots).fill(null);
    const at = new Map<number, number>(); // slot index -> weighted mood
    for (const e of inRange) {
      if (e.feeling == null) continue;
      const idx = Math.round((slotMs(e.date, e.hour) - start) / HOUR_MS);
      if (idx >= 0 && idx < slots) at.set(idx, weightedMood(e.feeling));
    }
    for (const [idx, v] of at) raw[idx] = v;
    const smoothed = trailingMovingAverage(raw, 3);
    const points: MoodPoint[] = [];
    for (let i = 0; i < smoothed.length; i++) {
      const v = smoothed[i];
      if (v != null) points.push({ t: start + i * HOUR_MS, value: v });
    }
    return { points, granularity };
  }

  // Daily: weighted avg per day, then trailing MA across consecutive days.
  const start = startOfDay(now, rangeDays - 1);
  const feelsByDayIdx = new Map<number, number[]>();
  for (const e of inRange) {
    if (e.feeling == null) continue;
    const dayIdx = Math.floor((slotMs(e.date, e.hour) - start) / DAY_MS);
    const arr = feelsByDayIdx.get(dayIdx) ?? [];
    arr.push(e.feeling);
    feelsByDayIdx.set(dayIdx, arr);
  }
  const raw: (number | null)[] = new Array(rangeDays).fill(null);
  for (const [dayIdx, feels] of feelsByDayIdx) {
    if (dayIdx >= 0 && dayIdx < rangeDays) raw[dayIdx] = weightedAvgMood(feels);
  }
  const smoothed = trailingMovingAverage(raw, 3);
  const points: MoodPoint[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    const v = smoothed[i];
    if (v != null) points.push({ t: start + i * DAY_MS, value: v });
  }
  return { points, granularity };
}
// #endregion
