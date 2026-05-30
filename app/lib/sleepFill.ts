// Pure mapping from Health "sleep sessions" to the (date, hour) slots RightNow
// tracks. No native imports here so it runs anywhere and is unit-testable.
//
// Whole-session model (per the approved plan): every hour a session overlaps is
// "asleep". A fully-covered interior hour always counts; a partial edge hour
// counts only if the session covers at least `threshold` of it (default 50%) so
// a sleep that ends at 7:05 doesn't claim the whole 7:00 hour.

const HOUR_MS = 60 * 60 * 1000;

export interface SleepSession {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface SleepSlot {
  date: string; // "YYYY-M-D" (local), matching entries.dateKey
  hour: number; // 0-23 (local)
}

function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Resolve sleep sessions to a sorted, de-duplicated list of local (date, hour)
 * slots considered asleep. `threshold` is the fraction of an hour a session must
 * cover for a partial edge hour to count (0..1, default 0.5).
 */
export function sleepHours(sessions: SleepSession[], threshold = 0.5): SleepSlot[] {
  const need = Math.max(0, Math.min(1, threshold)) * HOUR_MS;
  const seen = new Map<string, SleepSlot>();

  for (const s of sessions) {
    if (!(s.end > s.start)) continue;
    // First hour-aligned local slot at or before the session start.
    const first = new Date(s.start);
    first.setMinutes(0, 0, 0);
    for (let slotStart = first.getTime(); slotStart < s.end; slotStart += HOUR_MS) {
      const slotEnd = slotStart + HOUR_MS;
      const overlap = Math.min(s.end, slotEnd) - Math.max(s.start, slotStart);
      if (overlap < need) continue;
      const d = new Date(slotStart);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}#${d.getHours()}`;
      if (!seen.has(key)) {
        seen.set(key, { date: localDateKey(slotStart), hour: d.getHours() });
      }
    }
  }

  return [...seen.values()].sort((a, b) =>
    a.date === b.date ? a.hour - b.hour : a.date < b.date ? -1 : 1,
  );
}
