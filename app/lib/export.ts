// Full-calendar-year export builders, in the original WAYDRN spreadsheet's shape:
//   - CSV  : DATE,DAY,0:00..23:00,Notes,#, Name  (round-trips with lib/csv.ts import)
//   - HTML : a colored table (each cell shows the index number, filled with the
//            activity/feeling color) plus a legend, so it looks like the sheet.
// Pure (no React Native / web imports) so it's unit-testable; the actual file
// download/share lives in lib/share.ts.

export interface YearGridDay {
  mD: string; // "M/D"
  weekday: string; // "Sun".."Sat"
  values: (number | null)[]; // 24, the metric index per hour (null = blank)
  note?: string;
}

export interface LegendEntry {
  index: number;
  name: string;
  color: string;
}

const HOURS = Array.from({ length: 24 }, (_, h) => `${h}:00`);

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** WAYDRN-format CSV. The legend rides the #/Name columns of the first rows. */
export function buildCsv(days: YearGridDay[], legend: LegendEntry[], includeNotes: boolean): string {
  const header = ["DATE", "DAY", ...HOURS, "Notes", "#", "Name"];
  const lines = [header.join(",")];
  days.forEach((d, i) => {
    const leg = legend[i];
    const fields = [
      d.mD,
      d.weekday,
      ...d.values.map((v) => (v == null ? "" : String(v))),
      includeNotes && d.note ? csvField(d.note) : "",
      leg ? String(leg.index) : "",
      leg ? csvField(leg.name) : "",
    ];
    lines.push(fields.join(","));
  });
  return lines.join("\n");
}

/** Standalone HTML doc: colored index grid + legend, styled like the spreadsheet. */
export function buildHtml(title: string, days: YearGridDay[], legend: LegendEntry[]): string {
  const colorFor = new Map(legend.map((l) => [l.index, l.color]));
  const textOn = (hex: string) => {
    const h = hex.replace(/^#/, "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000" : "#fff";
  };
  const headCells = HOURS.map((_, h) => `<th>${h}</th>`).join("");
  const rows = days.map((d) => {
    const cells = d.values.map((v) => {
      if (v == null) return `<td class="e"></td>`;
      const bg = colorFor.get(v) ?? "#9e9e9e";
      return `<td style="background:${bg};color:${textOn(bg)}">${v}</td>`;
    }).join("");
    const note = d.note ? `<td class="note">${d.note.replace(/</g, "&lt;")}</td>` : `<td class="note"></td>`;
    return `<tr><th class="d">${d.mD}<span>${d.weekday}</span></th>${cells}${note}</tr>`;
  }).join("");
  const legendRows = legend.map((l) =>
    `<div class="li"><span class="sw" style="background:${l.color}"></span><b>${l.index}</b> ${l.name.replace(/</g, "&lt;")}</div>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:24px;color:#111}
    h1{font-size:20px}
    table{border-collapse:collapse;font-size:10px}
    th,td{width:20px;height:18px;text-align:center;border:1px solid #eceff1}
    th.d{width:46px;text-align:right;padding-right:4px;font-weight:600;color:#3c4043}
    th.d span{display:block;font-weight:400;color:#9aa0a6;font-size:8px}
    td.e{background:#f6f7f8}
    td.note{width:auto;text-align:left;padding:0 6px;color:#3c4043;border:none}
    thead th{color:#9aa0a6;font-weight:600}
    .legend{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
    .li{display:flex;align-items:center;gap:6px;font-size:12px}
    .sw{width:14px;height:14px;border-radius:3px;display:inline-block}
  </style></head><body>
    <h1>${title}</h1>
    <div class="legend">${legendRows}</div>
    <table><thead><tr><th class="d">DATE</th>${headCells}<th class="note">Notes</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </body></html>`;
}
