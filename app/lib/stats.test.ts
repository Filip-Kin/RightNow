// Run: bun test lib/stats.test.ts
import { expect, test } from "bun:test";
import {
  MOOD_WEIGHTS, weightedMood, weightedAvgMood, trailingMovingAverage,
  activityDistribution, avgMoodByActivity, byTimeOfDay, bestDays, moodLineSeries,
  activityByHourOfDay, entriesInRange,
} from "./stats";
import type { LocalEntry } from "./entries";

function e(date: string, hour: number, activity: number | null, feeling: number | null): LocalEntry {
  return { date, hour, activity, feeling, source: "manual", updatedAt: 0, deleted: false };
}

test("weighting curve matches the sheet", () => {
  expect([...MOOD_WEIGHTS]).toEqual([0, 0.25, 1.5, 3.5, 4.75, 5]);
  expect(weightedMood(0)).toBe(0);
  expect(weightedMood(3)).toBe(3.5);
  expect(weightedMood(5)).toBe(5);
});

test("weighted average mood", () => {
  expect(weightedAvgMood([])).toBeNull();
  // Great + Terrible -> (5 + 0) / 2
  expect(weightedAvgMood([5, 0])).toBe(2.5);
  // Neutral + Good -> (3.5 + 4.75) / 2
  expect(weightedAvgMood([3, 4])).toBeCloseTo(4.125);
});

test("trailing moving average ramps up and skips gaps like the sheet", () => {
  // window of 3, ramping: [v0], avg(v0,v1), avg(v0,v1,v2), avg(v1,v2,v3)...
  expect(trailingMovingAverage([3, 6, 9, 12], 3)).toEqual([3, 4.5, 6, 9]);
  // a null stays null; surrounding averages ignore it (AVERAGE-ignores-blank)
  expect(trailingMovingAverage([4, null, 8], 3)).toEqual([4, null, 6]);
});

test("activity distribution counts hours and fractions, desc", () => {
  const slices = activityDistribution([
    e("2026-1-1", 0, 3, 4), e("2026-1-1", 1, 3, 4), e("2026-1-1", 2, 8, null),
    e("2026-1-1", 3, null, 2), // no activity -> excluded
  ]);
  expect(slices[0]).toMatchObject({ activity: 3, hours: 2 });
  expect(slices[0].fraction).toBeCloseTo(2 / 3);
  expect(slices.find((s) => s.activity === 8)?.hours).toBe(1);
});

test("avg mood per activity uses weighted curve, ignores unrated hours", () => {
  const r = avgMoodByActivity([
    e("2026-1-1", 0, 3, 5), e("2026-1-1", 1, 3, 5), e("2026-1-1", 2, 3, null),
    e("2026-1-1", 3, 9, 0),
  ]);
  expect(r.find((x) => x.activity === 3)).toMatchObject({ mood: 5, hours: 2 });
  expect(r.find((x) => x.activity === 9)).toMatchObject({ mood: 0, hours: 1 });
  // sorted best mood first
  expect(r[0].activity).toBe(3);
});

test("by time of day buckets per hour", () => {
  const r = byTimeOfDay([
    e("2026-1-1", 9, 3, 4), e("2026-1-2", 9, 3, 4), e("2026-1-3", 9, 8, 2),
  ]);
  expect(r[9].topActivity).toBe(3); // Work most common at 9am
  expect(r[9].mood).toBeCloseTo((4.75 + 4.75 + 1.5) / 3);
  expect(r[0].topActivity).toBeNull();
});

test("activity by hour of day builds per-activity 24h histograms", () => {
  const r = activityByHourOfDay([
    e("2026-1-1", 9, 3, 4), e("2026-1-2", 9, 3, 4), e("2026-1-3", 17, 3, 2),
    e("2026-1-1", 22, 8, 4),
  ]);
  const work = r.find((x) => x.activity === 3)!;
  expect(work.counts[9]).toBe(2);
  expect(work.counts[17]).toBe(1);
  expect(work.counts[0]).toBe(0);
  expect(work.total).toBe(3);
  expect(work.max).toBe(2);
  // sorted by total desc: Work (3) before Leisure (1)
  expect(r[0].activity).toBe(3);
});

test("best days ranks by daily weighted mood and carries the row", () => {
  const r = bestDays([
    e("2026-1-1", 0, 3, 5), e("2026-1-1", 1, 3, 5), // day avg 5
    e("2026-1-2", 0, 9, 0), // day avg 0
  ]);
  expect(r[0].date).toBe("2026-1-1");
  expect(r[0].mood).toBe(5);
  expect(r[0].hours[0]?.activity).toBe(3);
  expect(r[1].date).toBe("2026-1-2");
});

test("mood line series: hourly for short range, smoothed", () => {
  const start = new Date(2026, 0, 1, 0, 0, 0).getTime();
  const end = new Date(2026, 0, 7, 23, 59, 59).getTime();
  const s = moodLineSeries([
    e("2026-1-5", 8, 3, 5), e("2026-1-5", 9, 3, 5), e("2026-1-5", 10, 9, 0),
  ], start, end);
  expect(s.granularity).toBe("hour");
  expect(s.points.length).toBe(3);
  // chronological
  expect(s.points[0].t).toBeLessThan(s.points[1].t);
  // 3rd point is trailing avg of (5,5,0) = 10/3
  expect(s.points[2].value).toBeCloseTo(10 / 3);
});

test("mood line series: daily aggregation for long range", () => {
  const start = new Date(2026, 0, 1, 0, 0, 0).getTime();
  const end = new Date(2026, 2, 1, 23, 59, 59).getTime(); // ~60 days > 31 -> daily
  const s = moodLineSeries([
    e("2026-1-1", 8, 3, 5), e("2026-1-1", 9, 3, 5),
    e("2026-2-1", 8, 9, 0),
  ], start, end);
  expect(s.granularity).toBe("day");
  expect(s.points.length).toBe(2);
});

test("entriesInRange filters by inclusive [start,end]", () => {
  const start = new Date(2026, 0, 2, 0, 0, 0).getTime();
  const end = new Date(2026, 0, 3, 23, 59, 59).getTime();
  const r = entriesInRange([
    e("2026-1-1", 9, 3, 4), // before
    e("2026-1-2", 9, 3, 4), // in
    e("2026-1-3", 23, 3, 4), // in
    e("2026-1-4", 0, 3, 4), // after
  ], start, end);
  expect(r.length).toBe(2);
});
