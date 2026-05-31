// Build + share a full-year export (the 2-page PDF and the round-trippable CSV),
// independent of any screen so Settings can trigger it. Reads the decrypted store.
import { buildCsv, buildPrintHtml, type LegendEntry, type YearGridDay } from "./export";
import { printPdf, saveExport } from "./share";
import { getActivities, feelings, feelingColors } from "./activities";
import { getAllEntries, getNotes, type LocalEntry } from "./entries";

export type Metric = "activity" | "feeling";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function legendFor(metric: Metric): LegendEntry[] {
  if (metric === "feeling") return feelings.map((name, index) => ({ index, name, color: feelingColors[index] }));
  return getActivities().map((a) => ({ index: a.index, name: a.name, color: a.color }));
}

function daysFor(year: number, metric: Metric): YearGridDay[] {
  const byDate = new Map<string, Map<number, LocalEntry>>();
  for (const e of getAllEntries()) {
    let h = byDate.get(e.date);
    if (!h) { h = new Map(); byDate.set(e.date, h); }
    h.set(e.hour, e);
  }
  const notes = getNotes();
  const out: YearGridDay[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    const key = `${year}-${d.getMonth() + 1}-${d.getDate()}`;
    const hmap = byDate.get(key);
    const values: (number | null)[] = [];
    for (let h = 0; h < 24; h++) {
      const e = hmap?.get(h);
      values.push(e ? (metric === "feeling" ? e.feeling : e.activity) : null);
    }
    out.push({ mD: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WEEKDAYS[d.getDay()], values, note: notes[key] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Years that have any data, oldest..newest (defaults to the current year). */
export function dataYears(thisYear: number): number[] {
  let min = thisYear;
  for (const e of getAllEntries()) {
    const y = Number(e.date.split("-")[0]);
    if (Number.isFinite(y) && y < min) min = y;
  }
  const out: number[] = [];
  for (let y = thisYear; y >= min; y--) out.push(y);
  return out;
}

/** Two-page PDF: activities on page 1, feelings on page 2. */
export async function exportYearPdf(year: number): Promise<void> {
  const html = buildPrintHtml(`WAYDRN ${year}`, [
    { heading: `WAYDRN ${year} - Activities`, days: daysFor(year, "activity"), legend: legendFor("activity") },
    { heading: `WAYDRN ${year} - Feelings`, days: daysFor(year, "feeling"), legend: legendFor("feeling") },
  ]);
  await printPdf(html);
}

/** CSV for one metric (round-trips with the importer). */
export async function exportYearCsv(year: number, metric: Metric): Promise<void> {
  const base = `waydrn-${year}-${metric === "feeling" ? "feelings" : "activities"}`;
  await saveExport(`${base}.csv`, "text/csv", buildCsv(daysFor(year, metric), legendFor(metric), metric === "activity"));
}
