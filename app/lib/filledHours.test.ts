import { expect, test, beforeEach } from "bun:test";
import {
  markFilled, clearFilled, isFilled, trimFilled, getToAsk, __resetForTest,
} from "./filledHours";

const HOUR = 60 * 60 * 1000;
// A fixed "now" so the window math is deterministic: 2026-06-03 12:30 local.
const NOW = new Date(2026, 5, 3, 12, 30, 0, 0).getTime();

function keyset(slots: { date: string; hour: number }[]) {
  return slots.map((s) => `${s.date}|${s.hour}`);
}

beforeEach(() => {
  __resetForTest(); // sync reset of the in-memory ledger between tests
});

test("getToAsk returns every fully-elapsed hour in the window when nothing is filled", () => {
  const ask = getToAsk(NOW, 24);
  expect(ask.length).toBe(24);
  // Oldest first, ending at the just-elapsed hour (11:00 block, since 12:00 is in progress).
  expect(ask[ask.length - 1]).toEqual({ date: "2026-6-3", hour: 11 });
  expect(ask[0]).toEqual({ date: "2026-6-2", hour: 12 });
});

test("the in-progress hour is never asked", () => {
  const ask = getToAsk(NOW, 24);
  expect(keyset(ask)).not.toContain("2026-6-3|12");
});

test("a filled hour drops out of the ask list", () => {
  markFilled("2026-6-3", 11);
  markFilled("2026-6-3", 9);
  const ask = getToAsk(NOW, 24);
  expect(isFilled("2026-6-3", 11)).toBe(true);
  expect(keyset(ask)).not.toContain("2026-6-3|11");
  expect(keyset(ask)).not.toContain("2026-6-3|9");
  expect(keyset(ask)).toContain("2026-6-3|10"); // the gap between them is still asked
  expect(ask.length).toBe(22);
});

test("clearFilled re-surfaces an hour", () => {
  markFilled("2026-6-3", 10);
  expect(getToAsk(NOW, 24).map((s) => `${s.date}|${s.hour}`)).not.toContain("2026-6-3|10");
  clearFilled("2026-6-3", 10);
  expect(getToAsk(NOW, 24).map((s) => `${s.date}|${s.hour}`)).toContain("2026-6-3|10");
});

test("trimFilled drops entries older than 25h but keeps recent ones", () => {
  markFilled("2026-6-3", 11); // ~1.5h ago
  markFilled("2026-6-2", 9); // ~27.5h ago -> outside the 25h keep window
  trimFilled(NOW);
  expect(isFilled("2026-6-3", 11)).toBe(true);
  expect(isFilled("2026-6-2", 9)).toBe(false);
});

test("filling non-consecutive interior hours never re-counts them (the overcount bug)", () => {
  // Mirrors: app logs the older 2 of a 3-hour gap; the most recent stays open.
  markFilled("2026-6-3", 9);
  markFilled("2026-6-3", 10);
  const ask = getToAsk(NOW, 3); // window covers 9:00, 10:00, 11:00 blocks
  expect(keyset(ask)).toEqual(["2026-6-3|11"]); // only the genuinely-open hour
});
