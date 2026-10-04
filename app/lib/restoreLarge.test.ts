// Large-restore regression: a 35k-entry backup restore crashed the Android app.
// The cause was a markFilled per entry (each serialising the whole ledger and
// queueing its own file write: O(n^2) time, gigabytes of snapshots). These tests
// run importEntries over a 35k-entry fixture with the native modules mocked out.
import { expect, test, mock, beforeEach } from "bun:test";

const DEK = new Uint8Array(32).fill(7);
const flushed: { entries: number }[] = [];

mock.module("@react-native-async-storage/async-storage", () => ({
  default: { multiRemove: async () => {}, getItem: async () => null, setItem: async () => {} },
}));
mock.module("./entryDb", () => ({
  dbLoadAll: async () => ({ entries: [], notes: [], cursor: 0, cursorId: "" }),
  dbFlush: async (o: { entries?: unknown[] }) => { flushed.push({ entries: o.entries?.length ?? 0 }); },
  dbClearAll: async () => {},
}));
mock.module("./trpc", () => ({ trpc: { entries: { push: { mutate: async () => ({}) }, pull: { query: async () => ({}) } } } }));
mock.module("./auth", () => ({ getDEK: () => DEK, isAuthError: () => false, markSessionExpired: () => {} }));
mock.module("./time", () => ({ useDate: () => new Date() }));
mock.module("./config", () => ({ getConfig: () => null }));
mock.module("./activities", () => ({
  applyPulledConfig: () => false, loadTaxonomy: async () => {}, markTaxonomyClean: () => {},
  subscribeTaxonomy: () => () => {}, taxonomyDirty: () => false, taxonomySealedRecord: () => ({}),
}));

const { importEntries, clearStore, getAllEntries } = await import("./entries");
const filledMod = await import("./filledHours");

const N = 35_000;
const HOUR = 3600_000;
/** 35k consecutive hours ending at the last full hour, like a multi-year backup. */
function fixture(activity = 3) {
  const end = new Date(); end.setMinutes(0, 0, 0);
  const out: { date: string; hour: number; activity: number; feeling: number; source: "manual" | "health" }[] = [];
  for (let i = N; i >= 1; i--) {
    const d = new Date(end.getTime() - i * HOUR);
    out.push({ date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, hour: d.getHours(), activity, feeling: 2, source: i % 10 === 0 ? "health" : "manual" });
  }
  return out;
}

beforeEach(async () => {
  await clearStore();
  filledMod.__resetForTest();
  flushed.length = 0;
});

test("35k-entry restore finishes fast, in one flush, with bounded memory", async () => {
  const items = fixture();
  Bun.gc(true);
  const heap0 = process.memoryUsage().heapUsed;
  const progress: number[] = [];
  const t0 = performance.now();
  const n = await importEntries(items, (done) => progress.push(done));
  const ms = performance.now() - t0;
  const heapMB = (process.memoryUsage().heapUsed - heap0) / 1e6;
  console.log(`importEntries x${N}: ${Math.round(ms)} ms, heap +${Math.round(heapMB)} MB`);

  expect(n).toBe(N);
  expect(getAllEntries().length).toBe(N);
  expect(flushed).toEqual([{ entries: N }]);
  // Sources survive the restore (a backup is lossless).
  expect(getAllEntries().filter((e) => e.source === "health").length).toBe(N / 10);
  // Progress ran across the whole loop, in yielded batches.
  expect(progress[0]).toBe(0);
  expect(progress[progress.length - 1]).toBe(N);
  expect(progress.length).toBeGreaterThan(N / 1000);
  // The old per-entry ledger write needed ~470 MB at 8k entries and grew with n^2.
  expect(heapMB).toBeLessThan(200);
  expect(ms).toBeLessThan(15_000);
  // Only the recent hours land in the "what to ask" ledger.
  expect(filledMod.getToAsk(Date.now(), 24).length).toBe(0);
});

test("restoring the same backup again writes and pushes nothing", async () => {
  const items = fixture();
  await importEntries(items);
  flushed.length = 0;
  await importEntries(items);
  expect(flushed).toEqual([]);
  // A changed value is still written.
  const changed = fixture(5).slice(0, 10);
  await importEntries(changed);
  expect(flushed).toEqual([{ entries: 10 }]);
});
