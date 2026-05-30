// Run: bun test lib/sleepFill.test.ts
import { expect, test } from "bun:test";
import { sleepHours } from "./sleepFill";

// Build a local-time epoch ms for a given Y/M/D H:M (avoids UTC/DST surprises).
const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

test("a clean overnight session covers each whole hour", () => {
  // 23:00 -> 07:00 = hours 23,0,1,2,3,4,5,6 (07:00 itself contributes 0 minutes).
  // Slots sort chronologically (date then hour), so day-1's 23 leads.
  const slots = sleepHours([{ start: at(2026, 5, 1, 23, 0), end: at(2026, 5, 2, 7, 0) }]);
  expect(slots.map((s) => s.hour)).toEqual([23, 0, 1, 2, 3, 4, 5, 6]);
  // hour 23 is on day 1, the early hours on day 2
  expect(slots.find((s) => s.hour === 23)!.date).toBe("2026-5-1");
  expect(slots.find((s) => s.hour === 0)!.date).toBe("2026-5-2");
});

test("partial edge hours follow the 50% threshold", () => {
  // 00:40 -> 02:20: hour 0 has 20min (<50% -> out), hour 1 full (in), hour 2 has 20min (out)
  const slots = sleepHours([{ start: at(2026, 5, 3, 0, 40), end: at(2026, 5, 3, 2, 20) }]);
  expect(slots.map((s) => s.hour)).toEqual([1]);
});

test("a lower threshold admits short edge overlaps", () => {
  const slots = sleepHours([{ start: at(2026, 5, 3, 0, 40), end: at(2026, 5, 3, 2, 20) }], 0.25);
  expect(slots.map((s) => s.hour)).toEqual([0, 1, 2]);
});

test("overlapping sessions de-duplicate", () => {
  const slots = sleepHours([
    { start: at(2026, 5, 4, 1, 0), end: at(2026, 5, 4, 4, 0) },
    { start: at(2026, 5, 4, 3, 0), end: at(2026, 5, 4, 6, 0) },
  ]);
  expect(slots.map((s) => s.hour)).toEqual([1, 2, 3, 4, 5]);
});

test("zero-length and inverted sessions are ignored", () => {
  expect(sleepHours([{ start: at(2026, 5, 5, 2, 0), end: at(2026, 5, 5, 2, 0) }])).toEqual([]);
  expect(sleepHours([{ start: at(2026, 5, 5, 5, 0), end: at(2026, 5, 5, 2, 0) }])).toEqual([]);
});
