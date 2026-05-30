// Run: bun test lib/dateRange.test.ts
import { expect, test } from "bun:test";
import { presetRange, customRange, rangeLabel, rangeDays } from "./dateRange";

// Thu 2026-05-28 12:00 local
const now = new Date(2026, 4, 28, 12, 0, 0).getTime();

test("last7 spans 7 inclusive days ending today", () => {
  const r = presetRange("last7", now);
  expect(rangeDays(r)).toBe(7);
  expect(new Date(r.startMs).getDate()).toBe(22);
  expect(new Date(r.endMs).getDate()).toBe(28);
});

test("today is a single day", () => {
  expect(rangeDays(presetRange("today", now))).toBe(1);
});

test("thisMonth starts on the 1st", () => {
  const r = presetRange("thisMonth", now);
  expect(new Date(r.startMs).getDate()).toBe(1);
  expect(new Date(r.startMs).getMonth()).toBe(4); // May
});

test("lastMonth is the whole previous month", () => {
  const r = presetRange("lastMonth", now);
  expect(new Date(r.startMs).getMonth()).toBe(3); // April
  expect(new Date(r.startMs).getDate()).toBe(1);
  expect(new Date(r.endMs).getMonth()).toBe(3);
  expect(new Date(r.endMs).getDate()).toBe(30); // April has 30 days
});

test("rangeLabel matches a preset, else shows the span", () => {
  expect(rangeLabel(presetRange("last30", now), now)).toBe("Last 30 Days");
  const custom = customRange(new Date(2026, 0, 1), new Date(2026, 0, 10));
  expect(rangeLabel(custom, now)).toBe("1/1 – 1/10");
});

test("customRange is order-independent + inclusive", () => {
  const a = customRange(new Date(2026, 0, 10), new Date(2026, 0, 1));
  expect(rangeDays(a)).toBe(10);
  expect(new Date(a.startMs).getDate()).toBe(1);
});
