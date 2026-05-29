// History: the big day-by-hour grid (rows = days, 24 columns = hours), echoing the
// original WAYDRN spreadsheet. Each cell is filled with the activity's color for
// that hour (or the feeling color, toggled). Tap a cell for its detail. Reads the
// local decrypted store (useEntries) + the custom taxonomy (useActivities).
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ScreenContainer";
import { sync, useEntries, type LocalEntry } from "@/lib/entries";
import {
  activityName, feelingColors, feelings, getActivity, useActivities,
} from "@/lib/activities";

const RANGES = [7, 30, 90, 365] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY = "#f0f0f0";
type ColorMode = "activity" | "feeling";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

interface DayRow {
  key: string;
  label: string; // "M/D"
  weekday: string;
  hours: (LocalEntry | undefined)[]; // 24
}

export default function HistoryScreen() {
  const entries = useEntries();
  useActivities(); // re-render on taxonomy edits (colors/names)
  const [range, setRange] = useState<number>(30);
  const [mode, setMode] = useState<ColorMode>("activity");
  const [selected, setSelected] = useState<{ date: string; hour: number; entry?: LocalEntry } | null>(null);

  // Pull/merge on open like Home.
  useEffect(() => {
    sync().catch(() => {/* offline ok */});
  }, []);

  // Index entries by date -> hour for O(1) cell lookup.
  const byDate = useMemo(() => {
    const m = new Map<string, Map<number, LocalEntry>>();
    for (const e of entries) {
      let h = m.get(e.date);
      if (!h) { h = new Map(); m.set(e.date, h); }
      h.set(e.hour, e);
    }
    return m;
  }, [entries]);

  // Build the day rows for the selected range (newest first).
  const rows = useMemo<DayRow[]>(() => {
    const out: DayRow[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < range; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = dayKey(d);
      const hmap = byDate.get(key);
      const hours: (LocalEntry | undefined)[] = [];
      for (let h = 0; h < 24; h++) hours.push(hmap?.get(h));
      out.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WEEKDAYS[d.getDay()], hours });
    }
    return out;
  }, [byDate, range]);

  // Summary over the visible range.
  const summary = useMemo(() => {
    const keys = new Set(rows.map((r) => r.key));
    let logged = 0;
    let feelSum = 0, feelN = 0;
    const actCount = new Map<number, number>();
    for (const e of entries) {
      if (!keys.has(e.date)) continue;
      logged++;
      if (e.feeling != null) { feelSum += e.feeling; feelN++; }
      if (e.activity != null) actCount.set(e.activity, (actCount.get(e.activity) ?? 0) + 1);
    }
    let topIdx: number | null = null, topN = 0;
    for (const [idx, n] of actCount) if (n > topN) { topN = n; topIdx = idx; }
    return {
      logged,
      avgFeeling: feelN ? feelSum / feelN : null,
      top: topIdx != null ? activityName(topIdx) : null,
    };
  }, [entries, rows]);

  function cellColor(e: LocalEntry | undefined): string {
    if (!e) return EMPTY;
    if (mode === "feeling") return e.feeling != null ? feelingColors[e.feeling] : EMPTY;
    return e.activity != null ? (getActivity(e.activity)?.color ?? "#9e9e9e") : EMPTY;
  }

  return (
    <ScreenContainer maxWidth={1100}>
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.heading}>History</Text>

      <View style={styles.summaryRow}>
        <Summary value={String(summary.logged)} label="hours logged" />
        <Summary value={summary.avgFeeling != null ? summary.avgFeeling.toFixed(1) : "–"} label="avg feeling" />
        <Summary value={summary.top ?? "–"} label="top activity" />
      </View>

      <View style={styles.controls}>
        <View style={styles.segment}>
          {RANGES.map((r) => (
            <TouchableOpacity key={r} style={[styles.segItem, range === r && styles.segItemActive]} onPress={() => setRange(r)}>
              <Text style={[styles.segText, range === r && styles.segTextActive]}>{r}d</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.modeBtn}
          onPress={() => setMode((m) => (m === "activity" ? "feeling" : "activity"))}
        >
          <Text style={styles.modeText}>{mode === "activity" ? "Activity" : "Feeling"}</Text>
        </TouchableOpacity>
      </View>

      {/* Hour header (aligned with the rows below via the same fixed label width + flex cells). */}
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
        initialNumToRender={31}
        windowSize={11}
        renderItem={({ item }) => (
          <View style={styles.dayRow}>
            <View style={styles.dayLabelCol}>
              <Text style={styles.dayLabel}>{item.label}</Text>
              <Text style={styles.dayWeekday}>{item.weekday}</Text>
            </View>
            {item.hours.map((e, h) => (
              <TouchableOpacity
                key={h}
                style={[
                  styles.cell,
                  { backgroundColor: cellColor(e) },
                  selected?.date === item.key && selected?.hour === h && styles.cellSelected,
                ]}
                onPress={() => setSelected({ date: item.key, hour: h, entry: e })}
              />
            ))}
          </View>
        )}
        ListFooterComponent={<Legend mode={mode} />}
      />

      {selected && <DetailBar selected={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
    </ScreenContainer>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function DetailBar({ selected, onClose }: { selected: { date: string; hour: number; entry?: LocalEntry }; onClose: () => void }) {
  const e = selected.entry;
  const [y, mo, d] = selected.date.split("-").map(Number);
  const dateLabel = `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d}`;
  const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  return (
    <View style={styles.detail}>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailTitle}>{dateLabel} · {h12(selected.hour)}–{h12((selected.hour + 1) % 24)}</Text>
        {e
          ? (
            <Text style={styles.detailBody}>
              {e.activity != null ? activityName(e.activity) : "No activity"}
              {e.feeling != null ? ` · ${feelings[e.feeling]}` : ""}
            </Text>
          )
          : <Text style={styles.detailEmpty}>Not logged</Text>}
      </View>
      <TouchableOpacity onPress={onClose} style={styles.detailClose}>
        <Text style={styles.detailCloseText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function Legend({ mode }: { mode: ColorMode }) {
  const activities = useActivities();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legend} contentContainerStyle={{ gap: 12, paddingHorizontal: 12 }}>
      {mode === "activity"
        ? activities.map((a) => (
          <View key={a.index} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: a.color }]} />
            <Text style={styles.legendText}>{a.name}</Text>
          </View>
        ))
        : feelings.map((f, i) => (
          <View key={f} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: feelingColors[i] }]} />
            <Text style={styles.legendText}>{f}</Text>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  heading: { fontSize: 28, fontWeight: "800", color: "#111", paddingHorizontal: 16, paddingTop: 4 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  summaryItem: { flex: 1, backgroundColor: "#f8f9fa", borderRadius: 10, padding: 12 },
  summaryValue: { fontSize: 18, fontWeight: "700", color: "#111" },
  summaryLabel: { fontSize: 11, color: "#5f6368", marginTop: 2 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: "#dadce0", borderRadius: 8, overflow: "hidden" },
  segItem: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#fff" },
  segItemActive: { backgroundColor: "#1a73e8" },
  segText: { fontSize: 13, fontWeight: "600", color: "#3c4043" },
  segTextActive: { color: "#fff" },
  modeBtn: { borderWidth: 1, borderColor: "#1a73e8", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  modeText: { color: "#1a73e8", fontWeight: "600", fontSize: 13 },

  headerRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "flex-end", marginBottom: 2 },
  headerCell: { flex: 1, alignItems: "center" },
  headerText: { fontSize: 8, color: "#9aa0a6" },
  dayRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "center", marginBottom: 2 },
  dayLabelCol: { width: 46 },
  dayLabel: { fontSize: 11, fontWeight: "600", color: "#3c4043" },
  dayWeekday: { fontSize: 9, color: "#9aa0a6" },
  cell: { flex: 1, height: 16, marginHorizontal: 0.5, borderRadius: 2 },
  cellSelected: { borderWidth: 1.5, borderColor: "#111" },

  detail: { flexDirection: "row", alignItems: "center", padding: 14, borderTopWidth: 1, borderTopColor: "#e0e0e0", backgroundColor: "#fafafa" },
  detailTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  detailBody: { fontSize: 14, color: "#3c4043", marginTop: 2 },
  detailEmpty: { fontSize: 14, color: "#9aa0a6", marginTop: 2, fontStyle: "italic" },
  detailClose: { padding: 8 },
  detailCloseText: { fontSize: 16, color: "#5f6368" },

  legend: { marginTop: 12, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 12, color: "#3c4043" },
});
