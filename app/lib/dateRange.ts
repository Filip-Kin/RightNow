// Date-range presets + helpers for the wakatime-style range picker. Pure + testable.
// A range is inclusive of both end days (local time): [start-of-startDay, end-of-endDay].

export interface DateRange {
  startMs: number;
  endMs: number;
}

export type PresetKey =
  | "today" | "yesterday" | "last7" | "last7yest" | "last14" | "last30"
  | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last7yest", label: "Last 7 Days from Yesterday" },
  { key: "last14", label: "Last 14 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
];

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function endOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Resolve a preset to a concrete inclusive range, relative to `now` (local). Week starts Sunday. */
export function presetRange(key: PresetKey, now: number): DateRange {
  const today = new Date(now);
  switch (key) {
    case "today": return { startMs: startOfDay(today), endMs: endOfDay(today) };
    case "yesterday": { const y = addDays(today, -1); return { startMs: startOfDay(y), endMs: endOfDay(y) }; }
    case "last7": return { startMs: startOfDay(addDays(today, -6)), endMs: endOfDay(today) };
    case "last7yest": return { startMs: startOfDay(addDays(today, -7)), endMs: endOfDay(addDays(today, -1)) };
    case "last14": return { startMs: startOfDay(addDays(today, -13)), endMs: endOfDay(today) };
    case "last30": return { startMs: startOfDay(addDays(today, -29)), endMs: endOfDay(today) };
    case "thisWeek": { const s = addDays(today, -today.getDay()); return { startMs: startOfDay(s), endMs: endOfDay(today) }; }
    case "lastWeek": { const s = addDays(today, -today.getDay() - 7); return { startMs: startOfDay(s), endMs: endOfDay(addDays(s, 6)) }; }
    case "thisMonth": { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { startMs: startOfDay(s), endMs: endOfDay(today) }; }
    case "lastMonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0); // last day of prev month
      return { startMs: startOfDay(s), endMs: endOfDay(e) };
    }
  }
}

/** Build a custom inclusive range from two day-Dates (order-independent). */
export function customRange(a: Date, b: Date): DateRange {
  const lo = a.getTime() <= b.getTime() ? a : b;
  const hi = a.getTime() <= b.getTime() ? b : a;
  return { startMs: startOfDay(lo), endMs: endOfDay(hi) };
}

/** A short human label for a range (matches a preset when it fits, else "M/D – M/D"). */
export function rangeLabel(range: DateRange, now: number): string {
  for (const p of PRESETS) {
    const r = presetRange(p.key, now);
    if (r.startMs === range.startMs && r.endMs === range.endMs) return p.label;
  }
  const f = (ms: number) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
  return `${f(range.startMs)} – ${f(range.endMs)}`;
}

/** Whole days spanned by a range (inclusive). endMs is end-of-day, so floor + 1. */
export function rangeDays(range: DateRange): number {
  return Math.floor((range.endMs - range.startMs) / 86400000) + 1;
}
