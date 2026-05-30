// Insights: stats over the selected range (7/30/90/365d), replicating the original
// WAYDRN spreadsheet's mood model (weighting + 3-point trailing-average decay; see
// lib/stats.ts). Reads the local decrypted store (useEntries) + taxonomy.
import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ScreenContainer";
import { DonutChart, HBar, LineChart } from "@/components/charts";
import { useEntries, type LocalEntry } from "@/lib/entries";
import {
  activityColor, activityName, feelingColors, feelings, getActivity, useActivities,
} from "@/lib/activities";
import {
  MOOD_MAX, activityDistribution, avgMoodByActivity, bestDays, byTimeOfDay,
  entriesInRange, moodLineSeries, weightedAvgMood,
} from "@/lib/stats";

const RANGES = [7, 30, 90, 365] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY = "#f0f0f0";

/** Map a weighted mood value (0-5) to a feeling-ramp color for the heat strips. */
function moodColor(v: number | null): string {
  if (v == null) return EMPTY;
  return feelingColors[Math.max(0, Math.min(5, Math.round(v)))];
}

function dayLabel(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  return `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d}`;
}

export default function InsightsScreen() {
  const entries = useEntries();
  useActivities(); // re-render on taxonomy edits (colors/names)
  const [range, setRange] = useState<number>(30);
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats = useMemo(() => {
    const now = Date.now();
    const inRange = entriesInRange(entries, range, now);
    const feels: number[] = [];
    for (const e of inRange) if (e.feeling != null) feels.push(e.feeling);
    return {
      logged: inRange.length,
      avgMood: weightedAvgMood(feels),
      series: moodLineSeries(entries, range, now),
      dist: activityDistribution(inRange),
      byActivity: avgMoodByActivity(inRange),
      timeOfDay: byTimeOfDay(inRange),
      best: bestDays(inRange, 5),
    };
  }, [entries, range]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const chartW = Math.max(0, width - 32); // minus card padding

  return (
    <ScreenContainer maxWidth={1100}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.heading}>Insights</Text>

        <View style={styles.segmentWrap}>
          <View style={styles.segment}>
            {RANGES.map((r) => (
              <TouchableOpacity key={r} style={[styles.segItem, range === r && styles.segItemActive]} onPress={() => setRange(r)}>
                <Text style={[styles.segText, range === r && styles.segTextActive]}>{r}d</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} onLayout={onLayout}>
          <View style={styles.summaryRow}>
            <Summary value={String(stats.logged)} label="hours logged" />
            <Summary value={stats.avgMood != null ? stats.avgMood.toFixed(2) : "–"} label="avg mood" />
            <Summary value={stats.best[0] ? dayLabel(stats.best[0].date) : "–"} label="best day" />
          </View>

          {stats.logged === 0
            ? <Text style={styles.empty}>No data in this range yet. Log some hours and they'll show up here.</Text>
            : (
              <>
                {/* Mood line */}
                <Card title="Mood" subtitle={`weighted, ${stats.series.granularity === "hour" ? "hourly" : "daily"} (3-pt smoothed)`}>
                  {chartW > 0 && (
                    <LineChart
                      points={stats.series.points}
                      min={0}
                      max={MOOD_MAX}
                      width={chartW}
                      color="#1a73e8"
                    />
                  )}
                  {stats.series.points.length === 0 && <Text style={styles.muted}>No rated hours in this range.</Text>}
                </Card>

                {/* Activity distribution */}
                <Card title="Activities">
                  <View style={styles.donutRow}>
                    <DonutChart slices={stats.dist.map((s) => ({ value: s.hours, color: activityColor(s.activity) }))} />
                    <View style={styles.donutLegend}>
                      {stats.dist.slice(0, 8).map((s) => (
                        <View key={s.activity} style={styles.legendItem}>
                          <View style={[styles.swatch, { backgroundColor: activityColor(s.activity) }]} />
                          <Text style={styles.legendText} numberOfLines={1}>{activityName(s.activity)}</Text>
                          <Text style={styles.legendPct}>{Math.round(s.fraction * 100)}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Card>

                {/* Avg mood per activity */}
                <Card title="Average mood per activity">
                  {stats.byActivity.map((a) => (
                    <View key={a.activity} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>{activityName(a.activity)}</Text>
                      <View style={styles.barTrack}>
                        {chartW > 0 && <HBar fraction={a.mood / MOOD_MAX} color={activityColor(a.activity)} width={chartW - 150} />}
                      </View>
                      <Text style={styles.barValue}>{a.mood.toFixed(1)}</Text>
                    </View>
                  ))}
                </Card>

                {/* Time of day */}
                <Card title="By time of day" subtitle="most common activity / average mood per hour">
                  <HourStrip cells={stats.timeOfDay.map((h) => h.topActivity != null ? activityColor(h.topActivity) : EMPTY)} />
                  <HourStrip cells={stats.timeOfDay.map((h) => moodColor(h.mood))} />
                  <View style={styles.hourAxis}>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <Text key={h} style={styles.hourAxisText}>{h % 3 === 0 ? h : ""}</Text>
                    ))}
                  </View>
                </Card>

                {/* Best days */}
                <Card title="Best days" subtitle="by daily weighted mood">
                  {stats.best.map((d) => (
                    <View key={d.date}>
                      <TouchableOpacity style={styles.bestRow} onPress={() => setExpanded(expanded === d.date ? null : d.date)}>
                        <Text style={styles.bestDate} numberOfLines={1}>{dayLabel(d.date)}</Text>
                        <View style={styles.bestStrip}>
                          <DayStrip hours={d.hours} />
                        </View>
                        <Text style={styles.bestMood}>{d.mood.toFixed(1)}</Text>
                      </TouchableOpacity>
                      {expanded === d.date && <DayDetail hours={d.hours} />}
                    </View>
                  ))}
                </Card>
              </>
            )}
        </ScrollView>
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

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function HourStrip({ cells }: { cells: string[] }) {
  return (
    <View style={styles.strip}>
      {cells.map((c, i) => <View key={i} style={[styles.stripCell, { backgroundColor: c }]} />)}
    </View>
  );
}

function DayStrip({ hours }: { hours: (LocalEntry | undefined)[] }) {
  return (
    <View style={styles.strip}>
      {hours.map((e, h) => (
        <View key={h} style={[styles.stripCell, { backgroundColor: e?.activity != null ? activityColor(e.activity) : EMPTY }]} />
      ))}
    </View>
  );
}

function DayDetail({ hours }: { hours: (LocalEntry | undefined)[] }) {
  const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  const logged = hours.map((e, h) => ({ e, h })).filter((x) => x.e);
  return (
    <View style={styles.detail}>
      {logged.map(({ e, h }) => (
        <View key={h} style={styles.detailLine}>
          <Text style={styles.detailHour}>{h12(h)}</Text>
          <View style={[styles.detailDot, { backgroundColor: e!.activity != null ? activityColor(e!.activity) : EMPTY }]} />
          <Text style={styles.detailText} numberOfLines={1}>
            {e!.activity != null ? activityName(e!.activity) : "No activity"}
            {e!.feeling != null ? ` · ${feelings[e!.feeling]}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  heading: { fontSize: 28, fontWeight: "800", color: "#111", paddingHorizontal: 16, paddingTop: 4 },
  segmentWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: "#dadce0", borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" },
  segItem: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: "#fff" },
  segItemActive: { backgroundColor: "#1a73e8" },
  segText: { fontSize: 13, fontWeight: "600", color: "#3c4043" },
  segTextActive: { color: "#fff" },

  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { fontSize: 14, color: "#9aa0a6", textAlign: "center", marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  muted: { fontSize: 13, color: "#9aa0a6", fontStyle: "italic" },

  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryItem: { flex: 1, backgroundColor: "#f8f9fa", borderRadius: 10, padding: 12 },
  summaryValue: { fontSize: 18, fontWeight: "700", color: "#111" },
  summaryLabel: { fontSize: 11, color: "#5f6368", marginTop: 2 },

  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#eceff1", borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardSubtitle: { fontSize: 12, color: "#9aa0a6", marginTop: 2 },
  cardBody: { marginTop: 12 },

  donutRow: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  donutLegend: { flex: 1, minWidth: 160, gap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { flex: 1, fontSize: 13, color: "#3c4043" },
  legendPct: { fontSize: 13, fontWeight: "600", color: "#5f6368" },

  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  barLabel: { width: 90, fontSize: 13, color: "#3c4043" },
  barTrack: { flex: 1 },
  barValue: { width: 32, fontSize: 13, fontWeight: "600", color: "#111", textAlign: "right" },

  strip: { flexDirection: "row", gap: 1, marginBottom: 2 },
  stripCell: { flex: 1, height: 16, borderRadius: 2 },
  hourAxis: { flexDirection: "row", marginTop: 2 },
  hourAxisText: { flex: 1, fontSize: 8, color: "#9aa0a6", textAlign: "center" },

  bestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  bestDate: { width: 84, fontSize: 13, fontWeight: "600", color: "#3c4043" },
  bestStrip: { flex: 1 },
  bestMood: { width: 32, fontSize: 13, fontWeight: "700", color: "#111", textAlign: "right" },
  detail: { backgroundColor: "#f8f9fa", borderRadius: 8, padding: 10, marginBottom: 8 },
  detailLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  detailHour: { width: 44, fontSize: 12, color: "#5f6368" },
  detailDot: { width: 10, height: 10, borderRadius: 3 },
  detailText: { flex: 1, fontSize: 13, color: "#3c4043" },
});
