// Run: bun test lib/transit.test.ts
import { expect, test } from "bun:test";
import {
  classify,
  measuredSpanHours,
  resampleTransit,
  transitSlots,
  TRANSITION_ACTIVITY,
  type TransitCell,
} from "./transit";

const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const cell = (activity: number | null, feeling: number | null = null): TransitCell => ({ activity, feeling });

// #region classify
test("classify: large jumps are flights (either direction), checked before DST", () => {
  expect(classify(16 * 60)).toBe("flight"); // east to NZ
  expect(classify(-16 * 60)).toBe("flight"); // west home
  expect(classify(120)).toBe("flight"); // +2h is a flight, not a DST forward-fill
  expect(classify(-120)).toBe("flight");
  expect(classify(90)).toBe("flight"); // boundary
});

test("classify: a 1-hour jump blends (DST / ground crossing)", () => {
  expect(classify(60)).toBe("blendForward"); // spring forward
  expect(classify(-60)).toBe("blendBackward"); // fall back
});

test("classify: sub-hour shifts and no change are no-ops", () => {
  expect(classify(0)).toBe("noop");
  expect(classify(15)).toBe("noop"); // e.g. India -> Nepal
  expect(classify(-45)).toBe("noop");
  expect(classify(59)).toBe("noop");
});
// #endregion

// #region measuredSpanHours
test("measuredSpanHours: east stretch, west floor-to-zero, and the cap", () => {
  // East: clock jumped forward, so local span >> real time (date line crossed).
  expect(measuredSpanHours(at(2026, 6, 5, 9, 0), at(2026, 6, 6, 17, 0), 48)).toBe(32);
  // West / "arrived before you left": local clock went backward -> 0 (caller floors to 1).
  expect(measuredSpanHours(at(2026, 6, 20, 9, 0), at(2026, 6, 20, 2, 0), 48)).toBe(0);
  // Cap protects against a stale baseline (app not opened for days).
  expect(measuredSpanHours(at(2026, 6, 1, 0, 0), at(2026, 6, 4, 0, 0), 24)).toBe(24);
});
// #endregion

// #region resampleTransit
test("resampleTransit: stretch repeats each source cell (10 -> 20 doubles)", () => {
  const seg = Array.from({ length: 10 }, (_, i) => cell(i));
  const out = resampleTransit(seg, 20);
  expect(out.length).toBe(20);
  expect(out.map((c) => c.activity)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);
});

test("resampleTransit: compress samples across (10 -> 5 takes every other)", () => {
  const seg = Array.from({ length: 10 }, (_, i) => cell(i));
  const out = resampleTransit(seg, 5);
  expect(out.map((c) => c.activity)).toEqual([0, 2, 4, 6, 8]);
});

test("resampleTransit: preserves the transition/sleep/transition shape and moods", () => {
  // 2h transition(m3), 6h sleep, 2h transition(m2) stretched to 20 slots.
  const seg: TransitCell[] = [
    cell(10, 3), cell(10, 3),
    cell(0), cell(0), cell(0), cell(0), cell(0), cell(0),
    cell(10, 2), cell(10, 2),
  ];
  const out = resampleTransit(seg, 20);
  expect(out.filter((c) => c.activity === 0).length).toBe(12); // sleep stays ~60%
  expect(out.filter((c) => c.activity === 10).length).toBe(8);
  expect(out[0]).toEqual({ activity: 10, feeling: 3 });
  expect(out[out.length - 1]).toEqual({ activity: 10, feeling: 2 });
});

test("resampleTransit: floor to a single Transition cell when compressed to <=1", () => {
  expect(resampleTransit([cell(0), cell(3), cell(7)], 1)).toEqual([{ activity: TRANSITION_ACTIVITY, feeling: null }]);
  expect(resampleTransit([cell(0), cell(3)], 0)).toEqual([{ activity: TRANSITION_ACTIVITY, feeling: null }]);
});

test("resampleTransit: empty segment fills the whole span with Transition (arrived gap)", () => {
  const out = resampleTransit([], 5);
  expect(out.length).toBe(5);
  expect(out.every((c) => c.activity === TRANSITION_ACTIVITY && c.feeling === null)).toBe(true);
});
// #endregion

// #region transitSlots
test("transitSlots: count consecutive hours ending at 'now', oldest first, across midnight", () => {
  const slots = transitSlots(at(2026, 6, 6, 1, 30), 4); // ending in the 01:00 hour
  expect(slots).toEqual([
    { date: "2026-6-5", hour: 22 },
    { date: "2026-6-5", hour: 23 },
    { date: "2026-6-6", hour: 0 },
    { date: "2026-6-6", hour: 1 },
  ]);
});
// #endregion
