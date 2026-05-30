// Run: bun test lib/export.test.ts
import { expect, test } from "bun:test";
import { buildCsv, buildHtml, type LegendEntry, type YearGridDay } from "./export";
import { parseWaydrnCsv } from "./csv";

const LEGEND: LegendEntry[] = [
  { index: 0, name: "Sleep", color: "#273036" },
  { index: 3, name: "Work, etc", color: "#1B5E20" }, // comma forces quoting
];

function day(mD: string, weekday: string, values: (number | null)[], note?: string): YearGridDay {
  return { mD, weekday, values: [...values, ...new Array(24 - values.length).fill(null)], note };
}

test("CSV round-trips through the importer", () => {
  const days = [
    day("1/1", "Mon", [0, 0, 3]),
    day("1/2", "Tue", [3, null, 3], "trip"),
  ];
  const csv = buildCsv(days, LEGEND, true);
  const parsed = parseWaydrnCsv(csv, 2025);

  // 1/1 -> 3 cells, 1/2 -> 2 cells (blank skipped)
  expect(parsed.cells.length).toBe(5);
  expect(parsed.cells.find((c) => c.date === "2025-1-1" && c.hour === 2)?.value).toBe(3);
  // legend embedded in the #/Name columns survives the trip (incl. the quoted name)
  expect(parsed.legend.get(0)).toBe("Sleep");
  expect(parsed.legend.get(3)).toBe("Work, etc");
  // note column round-trips
  expect(parsed.notes.get("2025-1-2")).toBe("trip");
});

test("CSV omits notes when includeNotes is false", () => {
  const csv = buildCsv([day("1/1", "Mon", [0], "secret")], LEGEND, false);
  expect(csv.includes("secret")).toBe(false);
});

test("HTML embeds colored index cells and the legend", () => {
  const html = buildHtml("WAYDRN 2025 - Activities", [day("1/1", "Mon", [3])], LEGEND);
  expect(html).toContain("<title>WAYDRN 2025 - Activities</title>");
  expect(html).toContain("background:#1B5E20"); // activity 3 cell colored
  expect(html).toContain("Sleep"); // legend
});
