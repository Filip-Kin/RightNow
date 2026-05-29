// Run: bun test lib/csv.test.ts
import { expect, test } from "bun:test";
import { inferYearFromName, parseWaydrnCsv } from "./csv";

// Mirrors the real export: DATE,DAY,hours...,Notes,#, Name with the legend
// embedded in the first rows, plus a Notes value and a fractional average to skip.
const SAMPLE = [
  "DATE,DAY,0:00,1:00,2:00,Notes,#, Name",
  "1/1,WED,8,8,0,, 0, Sleep",
  "1/2,THU,8,9,9,FRC Kickoff, 1, Dating",
  "1/3,FRI,0,,3, , 2, Friends",
  "Average,,2.67,8.5,4.0,,,",
].join("\n");

test("parses hour cells, skips blanks/averages, reads legend", () => {
  const r = parseWaydrnCsv(SAMPLE, 2023);
  // 3 day rows x (filled hour cells): 1/1 -> 3, 1/2 -> 3, 1/3 -> 2 (one blank skipped) = 8
  expect(r.cells.length).toBe(8);
  expect(r.dayCount).toBe(3);
  // No cell came from the "Average" summary row.
  expect(r.cells.every((c) => c.date.startsWith("2023-"))).toBe(true);
  // Specific cell mapping (year-month-day + hour + value).
  expect(r.cells).toContainEqual({ date: "2023-1-2", hour: 1, value: 9 });
  expect(r.cells).toContainEqual({ date: "2023-1-3", hour: 2, value: 3 });
  // 1/3 hour 1 was blank -> absent.
  expect(r.cells.find((c) => c.date === "2023-1-3" && c.hour === 1)).toBeUndefined();
  // Legend from the #/Name columns.
  expect(r.legend.get(0)).toBe("Sleep");
  expect(r.legend.get(1)).toBe("Dating");
  expect(r.legend.get(2)).toBe("Friends");
  // Distinct values present.
  expect(r.values).toEqual([0, 3, 8, 9]);
  // Notes column captured per day (only non-empty).
  expect(r.notes.get("2023-1-2")).toBe("FRC Kickoff");
  expect(r.notes.has("2023-1-1")).toBe(false);
});

test("infers year from filename", () => {
  expect(inferYearFromName("2024 WAYDRN.csv")).toBe(2024);
  expect(inferYearFromName("HAYFRN-2025.csv")).toBe(2025);
  expect(inferYearFromName("export.csv")).toBeUndefined();
});

test("throws on a file with no header", () => {
  expect(() => parseWaydrnCsv("just,some,data\n1,2,3", 2023)).toThrow();
});
