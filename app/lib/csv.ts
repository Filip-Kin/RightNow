// Parser for the historical WAYDRN/HAYFRN spreadsheet CSV export. Each sheet is a
// grid: a header row `DATE,DAY,0:00,...,23:00,Notes,#, Name`, then one row per day
// `M/D, weekday, v0, ..., v23 [,Notes]`. Cell values are integer indices (activity
// 0-10, feeling 0-5). The first rows also carry the legend in the `#` / `Name`
// columns (e.g. `3, Robots`), which we surface so import can map old indices.
//
// We only read columns whose header is an hour ("H:00") and rows whose first cell
// is an M/D date, so summary rows/columns and embedded averages are ignored.

export interface ParsedCell {
  date: string; // "YYYY-M-D"
  hour: number; // 0-23
  value: number; // integer index
}

export interface ParsedCsv {
  cells: ParsedCell[];
  legend: Map<number, string>; // source index -> name, from the `#`/`Name` columns
  values: number[]; // distinct cell values present, sorted
  dayCount: number; // number of day rows that produced at least one cell
}

/** Split one CSV line into fields, honoring double-quoted fields and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

/**
 * Parse a WAYDRN-format CSV into hour cells + legend. `year` supplies the calendar
 * year (the sheet only stores M/D). Blank and non-integer cells are skipped.
 */
export function parseWaydrnCsv(text: string, year: number): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("Empty file");

  // Locate the header row (starts with a DATE column) and map columns.
  const headerIdx = lines.findIndex((l) => /^"?date"?\s*,/i.test(l));
  if (headerIdx < 0) throw new Error("No header row found (expected a row starting with DATE).");
  const header = splitCsvLine(lines[headerIdx]).map((h) => h.trim());

  const hourCols = new Map<number, number>(); // column index -> hour
  let nameCol = -1;
  let numberCol = -1;
  header.forEach((h, col) => {
    const m = /^(\d{1,2}):00$/.exec(h);
    if (m) hourCols.set(col, Number(m[1]));
    else if (/^#$/.test(h)) numberCol = col;
    else if (/^name$/i.test(h)) nameCol = col;
  });
  if (hourCols.size === 0) throw new Error("No hour columns (H:00) found in the header.");

  const cells: ParsedCell[] = [];
  const legend = new Map<number, string>();
  const valueSet = new Set<number>();
  let dayCount = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const dateRaw = (fields[0] ?? "").trim();
    const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(dateRaw);

    // Legend lives in the `#`/`Name` columns of the early rows; collect it even
    // though those rows are also normal day rows.
    if (numberCol >= 0 && nameCol >= 0) {
      const numRaw = (fields[numberCol] ?? "").trim();
      const name = (fields[nameCol] ?? "").trim();
      if (/^\d+$/.test(numRaw) && name) legend.set(Number(numRaw), name);
    }

    if (!dm) continue; // not a day row
    const month = Number(dm[1]);
    const day = Number(dm[2]);
    const date = `${year}-${month}-${day}`;

    let produced = false;
    for (const [col, hour] of hourCols) {
      const raw = (fields[col] ?? "").trim();
      if (raw === "") continue;
      if (!/^-?\d+$/.test(raw)) continue; // skip averages / fractional summary cells
      const value = Number(raw);
      cells.push({ date, hour, value });
      valueSet.add(value);
      produced = true;
    }
    if (produced) dayCount++;
  }

  return { cells, legend, values: [...valueSet].sort((a, b) => a - b), dayCount };
}

/** "2023 WAYDRN.csv" / "HAYFRN-2024.csv" -> 2023 / 2024, else undefined. */
export function inferYearFromName(name: string): number | undefined {
  const m = /(19|20)\d{2}/.exec(name);
  return m ? Number(m[0]) : undefined;
}
