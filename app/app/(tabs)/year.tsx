// Year view: the full calendar year (Jan 1 - Dec 31) as a day x hour color grid,
// echoing the original WAYDRN spreadsheet. Step between years to browse history,
// and export the whole year as HTML (colored index grid) or CSV (round-trips with
// the importer). Reads the local decrypted store + taxonomy.
import React, { useMemo, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useEntries, useNotes, type LocalEntry } from "@/lib/entries";
import {
  activityColor, activityName, feelingColors, feelings, getActivity, getActivities, useActivities,
} from "@/lib/activities";
import { buildCsv, buildHtml, type LegendEntry, type YearGridDay } from "@/lib/export";
import { saveExport } from "@/lib/share";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY = "#f0f0f0";
type Metric = "activity" | "feeling";

export default function YearScreen() {
  const entries = useEntries();
  const notes = useNotes();
  useActivities();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [metric, setMetric] = useState<Metric>("activity");

  // Index entries by date -> hour, and learn which years have data.
  const { byDate, minYear } = useMemo(() => {
    const m = new Map<string, Map<number, LocalEntry>>();
    let min = thisYear;
    for (const e of entries) {
      let h = m.get(e.date);
      if (!h) { h = new Map(); m.set(e.date, h); }
      h.set(e.hour, e);
      const y = Number(e.date.split("-")[0]);
      if (y < min) min = y;
    }
    return { byDate: m, minYear: min };
  }, [entries, thisYear]);

  // One row per day of the selected year.
  const rows = useMemo(() => {
    const out: { key: string; mD: string; weekday: string; hours: (LocalEntry | undefined)[]; note?: string }[] = [];
    const d = new Date(year, 0, 1);
    while (d.getFullYear() === year) {
      const key = `${year}-${d.getMonth() + 1}-${d.getDate()}`;
      const hmap = byDate.get(key);
      const hours: (LocalEntry | undefined)[] = [];
      for (let h = 0; h < 24; h++) hours.push(hmap?.get(h));
      out.push({ key, mD: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WEEKDAYS[d.getDay()], hours, note: notes[key] });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [byDate, year, notes]);

  function cellColor(e: LocalEntry | undefined): string {
    if (!e) return EMPTY;
    if (metric === "feeling") return e.feeling != null ? feelingColors[e.feeling] : EMPTY;
    return e.activity != null ? (getActivity(e.activity)?.color ?? "#9e9e9e") : EMPTY;
  }

  function metricValue(e: LocalEntry | undefined): number | null {
    if (!e) return null;
    return metric === "feeling" ? e.feeling : e.activity;
  }

  function legendEntries(): LegendEntry[] {
    if (metric === "feeling") {
      return feelings.map((name, index) => ({ index, name, color: feelingColors[index] }));
    }
    return getActivities().map((a) => ({ index: a.index, name: a.name, color: a.color }));
  }

  function gridDays(): YearGridDay[] {
    return rows.map((r) => ({
      mD: r.mD,
      weekday: r.weekday,
      values: r.hours.map(metricValue),
      note: r.note,
    }));
  }

  async function doExport(kind: "html" | "csv") {
    const title = `WAYDRN ${year} - ${metric === "feeling" ? "Feelings" : "Activities"}`;
    const base = `waydrn-${year}-${metric === "feeling" ? "feelings" : "activities"}`;
    try {
      if (kind === "csv") {
        await saveExport(`${base}.csv`, "text/csv", buildCsv(gridDays(), legendEntries(), metric === "activity"));
      } else {
        await saveExport(`${base}.html`, "text/html", buildHtml(title, gridDays(), legendEntries()));
      }
    } catch (err) {
      console.warn("export failed", err);
    }
  }

  return (
    <ScreenContainer maxWidth={1100}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.yearNav}>
          <TouchableOpacity
            style={[styles.navBtn, year <= minYear && styles.navBtnDisabled]}
            disabled={year <= minYear}
            onPress={() => setYear((y) => y - 1)}
          >
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.yearLabel}>{year}</Text>
          <TouchableOpacity
            style={[styles.navBtn, year >= thisYear && styles.navBtnDisabled]}
            disabled={year >= thisYear}
            onPress={() => setYear((y) => y + 1)}
          >
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.modeBtn}
            onPress={() => setMetric((m) => (m === "activity" ? "feeling" : "activity"))}
          >
            <Text style={styles.modeText}>{metric === "activity" ? "Activity" : "Feeling"}</Text>
          </TouchableOpacity>
          <View style={styles.exportRow}>
            <TouchableOpacity style={styles.exportBtn} onPress={() => doExport("html")}>
              <Text style={styles.exportText}>{Platform.OS === "web" ? "Download HTML" : "Export HTML"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportBtn} onPress={() => doExport("csv")}>
              <Text style={styles.exportText}>{Platform.OS === "web" ? "Download CSV" : "Export CSV"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hour header */}
        <View style={styles.headerRow}>
          <View style={styles.dayLabelCol} />
          {Array.from({ length: 24 }).map((_, h) => (
            <View key={h} style={styles.headerCell}>
              <Text style={styles.headerText}>{h % 3 === 0 ? h : ""}</Text>
            </View>
          ))}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          initialNumToRender={40}
          windowSize={11}
          renderItem={({ item }) => (
            <View style={styles.dayRow}>
              <View style={[styles.dayLabelCol, item.note && styles.dayLabelNote]}>
                <Text style={styles.dayLabel} numberOfLines={1}>
                  {item.mD}{item.note ? <Text style={styles.noteDot}> ●</Text> : null}
                </Text>
                <Text style={styles.dayWeekday}>{item.weekday}</Text>
              </View>
              {item.hours.map((e, h) => (
                <View key={h} style={[styles.cell, { backgroundColor: cellColor(e) }]} />
              ))}
            </View>
          )}
        />
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  yearNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, paddingTop: 4, paddingBottom: 8 },
  navBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f3f4" },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: { fontSize: 24, color: "#1a73e8", fontWeight: "700", marginTop: -2 },
  yearLabel: { fontSize: 26, fontWeight: "800", color: "#111", minWidth: 80, textAlign: "center" },

  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10, gap: 8, flexWrap: "wrap" },
  modeBtn: { borderWidth: 1, borderColor: "#1a73e8", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  modeText: { color: "#1a73e8", fontWeight: "600", fontSize: 13 },
  exportRow: { flexDirection: "row", gap: 8 },
  exportBtn: { backgroundColor: "#1a73e8", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  exportText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  headerRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "flex-end", marginBottom: 2 },
  headerCell: { flex: 1, alignItems: "center" },
  headerText: { fontSize: 8, color: "#9aa0a6" },
  dayRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "center", marginBottom: 2 },
  dayLabelCol: { width: 46, paddingVertical: 1, paddingHorizontal: 3, borderRadius: 4 },
  dayLabelNote: { backgroundColor: "#ffe082", borderWidth: 1, borderColor: "#f5b800" },
  noteDot: { fontSize: 7, color: "#b06000" },
  dayLabel: { fontSize: 11, fontWeight: "600", color: "#3c4043" },
  dayWeekday: { fontSize: 9, color: "#9aa0a6" },
  cell: { flex: 1, height: 14, marginHorizontal: 0.5, borderRadius: 2 },
});
