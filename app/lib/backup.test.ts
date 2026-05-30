// Run: bun test lib/backup.test.ts
import { expect, test } from "bun:test";
import { serializeBackup, parseBackup, backupFilename, BACKUP_SCHEMA } from "./backup";
import type { LocalEntry } from "./entries";
import type { ActivityDef } from "./activities";

const ACTS: ActivityDef[] = [
  { index: 0, name: "Sleep", color: "#273036", icon: "bed", skipFeeling: true },
  { index: 3, name: "Work", color: "#1B5E20", icon: "work" },
];
function e(date: string, hour: number, a: number | null, f: number | null): LocalEntry {
  return { date, hour, activity: a, feeling: f, source: "manual", updatedAt: 123, deleted: false };
}

test("serialize -> parse round-trips entries, notes, taxonomy", () => {
  const json = serializeBackup(ACTS, [e("2026-1-1", 0, 0, null), e("2026-1-1", 9, 3, 4)], { "2026-1-1": "FRC" }, "2026-05-30T00:00:00.000Z");
  const out = parseBackup(json);
  expect(out.activities).toEqual(ACTS);
  expect(out.entries.length).toBe(2);
  expect(out.entries[1]).toEqual({ date: "2026-1-1", hour: 9, activity: 3, feeling: 4, source: "manual" });
  expect(out.notes).toEqual([{ date: "2026-1-1", note: "FRC" }]);
});

test("the file is tagged so it can't be confused with a CSV", () => {
  const json = serializeBackup([], [], {}, "2026-05-30T00:00:00.000Z");
  expect(JSON.parse(json).schema).toBe(BACKUP_SCHEMA);
});

test("rejects non-backup JSON and non-JSON", () => {
  expect(() => parseBackup('{"DATE":"1/1"}')).toThrow(/Not a RightNow backup/);
  expect(() => parseBackup("DATE,DAY,0:00")).toThrow(/valid JSON/);
});

test("skips malformed entries/notes defensively", () => {
  const json = JSON.stringify({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: "x", activities: [],
    entries: [{ date: "2026-1-1", hour: 5, activity: 2, feeling: null, source: "manual" }, { hour: 3 }, null],
    notes: [{ date: "2026-1-2", note: "ok" }, { date: "2026-1-3", note: "" }, { note: "x" }],
  });
  const out = parseBackup(json);
  expect(out.entries.length).toBe(1);
  expect(out.notes).toEqual([{ date: "2026-1-2", note: "ok" }]);
});

test("backupFilename includes date and time", () => {
  expect(backupFilename("2026-05-30T01:02:03.000Z")).toBe("rightnow-backup-2026-05-30-010203.json");
});
