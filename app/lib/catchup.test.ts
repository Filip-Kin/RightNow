import { expect, test } from "bun:test";
import { activityGapSlots, moodGapSlots, incompleteDayCount, slotMs } from "./catchup";
import type { LocalEntry } from "./entries";

// A fixed "now": Jan 10 2026, 11:30 local. Hours 0..10 on the 10th are fully elapsed
// (hour 10 ends at 11:00); hour 11 onward is not. Earlier days are fully elapsed.
const NOW = new Date(2026, 0, 10, 11, 30, 0).getTime();

function e(date: string, hour: number, activity: number | null, feeling: number | null): LocalEntry {
  return { date, hour, activity, feeling, source: "manual", updatedAt: slotMs(date, hour), deleted: false };
}

// Sleep = activity index 0 (skip-feeling), like the default taxonomy.
const isSleep = (i: number) => i === 0;

test("activity gaps: only elapsed hours with no activity, oldest first", () => {
  // Jan 9 fully logged with activity on every hour; Jan 10 has activity only at 0-2.
  const entries: LocalEntry[] = [];
  for (let h = 0; h < 24; h++) entries.push(e("2026-1-9", h, 5, 3));
  entries.push(e("2026-1-10", 0, 5, 3), e("2026-1-10", 1, 5, 3), e("2026-1-10", 2, 5, 3));

  const gaps = activityGapSlots(entries, NOW, 30);
  // Jan 10 hours 3..10 are elapsed and blank (8). Hours 11+ on the 10th aren't elapsed.
  expect(gaps.every((g) => g.date === "2026-1-10")).toBe(true);
  expect(gaps.map((g) => g.hour)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  // oldest first
  expect(slotMs(gaps[0].date, gaps[0].hour)).toBeLessThan(slotMs(gaps[1].date, gaps[1].hour));
});

test("activity gaps never include future/not-yet-elapsed hours", () => {
  const gaps = activityGapSlots([e("2026-1-10", 0, 5, 3)], NOW, 30);
  for (const g of gaps) expect(slotMs(g.date, g.hour) + 3_600_000).toBeLessThanOrEqual(NOW);
});

test("mood gaps: activity present, no feeling, excluding sleep", () => {
  const entries = [
    e("2026-1-9", 8, 5, null),  // activity, no feeling -> mood gap
    e("2026-1-9", 9, 0, null),  // sleep, no feeling -> NOT a gap
    e("2026-1-9", 10, 5, 4),    // fully logged -> not a gap
    e("2026-1-9", 11, null, null), // no activity -> not a mood gap (activity pass first)
  ];
  const gaps = moodGapSlots(entries, NOW, 30, isSleep);
  expect(gaps.map((g) => `${g.date}@${g.hour}`)).toEqual(["2026-1-9@8"]);
});

test("horizon bounds the look-back", () => {
  // One old entry on Jan 1 anchors "first data"; every day since is blank, so a wider
  // window surfaces more incomplete days than a narrow one.
  const entries = [e("2026-1-1", 0, 5, 3)];
  const narrow = incompleteDayCount(entries, NOW, 5, isSleep); // Jan 6..10 = 5 blank days
  const wide = incompleteDayCount(entries, NOW, 30, isSleep);  // clipped to first data (Jan 1..10)
  expect(narrow).toBe(5);
  expect(wide).toBe(10);
  expect(wide).toBeGreaterThan(narrow);
});

test("days before the first-ever entry are not counted as incomplete", () => {
  // Fully log Jan 9 and the elapsed part of Jan 10; the only earlier day (Jan 8-) is
  // blank but predates all data, so nothing is incomplete.
  const entries: LocalEntry[] = [];
  for (let h = 0; h < 24; h++) entries.push(e("2026-1-9", h, 5, 3));
  for (let h = 0; h <= 10; h++) entries.push(e("2026-1-10", h, 5, 3)); // elapsed hours today
  expect(incompleteDayCount(entries, NOW, 30, isSleep)).toBe(0);
});

test("incomplete day count: a day of only imported sleep is incomplete", () => {
  const entries: LocalEntry[] = [];
  for (let h = 0; h < 8; h++) entries.push(e("2026-1-9", h, 0, null)); // sleep 0-7 only
  for (let h = 0; h <= 10; h++) entries.push(e("2026-1-10", h, 5, 3)); // today fully logged
  // Only Jan 9 (sleep-only, rest blank) is incomplete.
  expect(incompleteDayCount(entries, NOW, 30, isSleep)).toBe(1);
});
