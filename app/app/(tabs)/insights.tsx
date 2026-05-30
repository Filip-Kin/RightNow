// Insights: stats over a chosen date range (wakatime-style picker), replicating the
// original WAYDRN spreadsheet's mood model (weighting + 3-point trailing-average
// decay; see lib/stats.ts). Reads the local decrypted store (useEntries) + taxonomy.
import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ScreenContainer";
import { DonutChart, HBar, LineChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";
import { presetRange, type DateRange } from "@/lib/dateRange";
import { useEntries, type LocalEntry } from "@/lib/entries";
import {
  activityColor, activityName, feelingColors, feelings, getActivity, useActivities,
} from "@/lib/activities";
import {
  MOOD_MAX, activityByHourOfDay, activityDistribution, avgMoodByActivity, bestDays, byTimeOfDay,
  entriesInRange, moodLineSeries, weightedAvgMood,
} from "@/lib/stats";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Map a weighted mood value (0-5) to a feeling-ramp color for the heat strips. */
function moodColor(v: number | null, empty: string): string {
  if (v == null) return empty;
  return feelingColors[Math.max(0, Math.min(5, Math.round(v)))];
}

/** A hex color at the given alpha, for heatmap intensity. */
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace(/^#/, "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function dayLabel(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  return `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d}`;
}

export default function InsightsScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const entries = useEntries();
  useActivities(); // re-render on taxonomy edits (colors/names)
  const [now] = useState(() => Date.now()); // stable for presets/labels this session
  const [dr, setDr] = useState<DateRange>(() => presetRange("last30", now));
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats = useMemo(() => {
    const inRange = entriesInRange(entries, dr.startMs, dr.endMs);
    const feels: number[] = [];
    for (const e of inRange) if (e.feeling != null) feels.push(e.feeling);
    return {
      logged: inRange.length,
      avgMood: weightedAvgMood(feels),
      series: moodLineSeries(entries, dr.startMs, dr.endMs),
      dist: activityDistribution(inRange),
      byActivity: avgMoodByActivity(inRange),
      timeOfDay: byTimeOfDay(inRange),
      activityHeat: activityByHourOfDay(inRange),
      best: bestDays(inRange, 5),
    };
  }, [entries, dr]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const chartW = Math.max(0, width - 32); // minus card padding

  return (
    <ScreenContainer maxWidth={1100}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.heading}>Insights</Text>

        <View style={styles.segmentWrap}>
          <DateRangePicker value={dr} onChange={setDr} now={now} />
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
                      color={c.primary}
                      fill={c.chartFill}
                      grid={c.cardBorder}
                      axis={c.textFaint}
                    />
                  )}
                  {stats.series.points.length === 0 && <Text style={styles.muted}>No rated hours in this range.</Text>}
                </Card>

                {/* Activity distribution */}
                <Card title="Activities">
                  <View style={styles.donutRow}>
                    <DonutChart slices={stats.dist.map((s) => ({ value: s.hours, color: activityColor(s.activity) }))} track={c.track} />
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
                        {chartW > 0 && <HBar fraction={a.mood / MOOD_MAX} color={activityColor(a.activity)} width={chartW - 150} track={c.track} />}
                      </View>
                      <Text style={styles.barValue}>{a.mood.toFixed(1)}</Text>
                    </View>
                  ))}
                </Card>

                {/* Time of day */}
                <Card title="By time of day" subtitle="most common activity / average mood per hour">
                  <HourStrip cells={stats.timeOfDay.map((h) => h.topActivity != null ? activityColor(h.topActivity) : c.empty)} />
                  <HourStrip cells={stats.timeOfDay.map((h) => moodColor(h.mood, c.empty))} />
                  <HourAxis />

                  <Text style={styles.heatCaption}>Each activity by hour</Text>
                  {stats.activityHeat.map((row) => (
                    <View key={row.activity} style={styles.heatRow}>
                      <Text style={styles.heatLabel} numberOfLines={1}>{activityName(row.activity)}</Text>
                      <View style={[styles.strip, styles.flex1]}>
                        {row.counts.map((n, h) => (
                          <View
                            key={h}
                            style={[styles.stripCell, { backgroundColor: n === 0 ? c.empty : hexToRgba(activityColor(row.activity), 0.2 + 0.8 * (n / row.max)) }]}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                  <View style={styles.heatRow}>
                    <View style={styles.heatLabel} />
                    <View style={[styles.hourAxis, styles.flex1]}>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <Text key={h} style={styles.hourAxisText}>{h % 3 === 0 ? h : ""}</Text>
                      ))}
                    </View>
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
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function HourStrip({ cells }: { cells: string[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.strip}>
      {cells.map((cell, i) => <View key={i} style={[styles.stripCell, { backgroundColor: cell }]} />)}
    </View>
  );
}

function HourAxis() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.hourAxis}>
      {Array.from({ length: 24 }).map((_, h) => (
        <Text key={h} style={styles.hourAxisText}>{h % 3 === 0 ? h : ""}</Text>
      ))}
    </View>
  );
}

function DayStrip({ hours }: { hours: (LocalEntry | undefined)[] }) {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.strip}>
      {hours.map((e, h) => (
        <View key={h} style={[styles.stripCell, { backgroundColor: e?.activity != null ? activityColor(e.activity) : c.empty }]} />
      ))}
    </View>
  );
}

function DayDetail({ hours }: { hours: (LocalEntry | undefined)[] }) {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  const logged = hours.map((e, h) => ({ e, h })).filter((x) => x.e);
  return (
    <View style={styles.detail}>
      {logged.map(({ e, h }) => (
        <View key={h} style={styles.detailLine}>
          <Text style={styles.detailHour}>{h12(h)}</Text>
          <View style={[styles.detailDot, { backgroundColor: e!.activity != null ? activityColor(e!.activity) : c.empty }]} />
          <Text style={styles.detailText} numberOfLines={1}>
            {e!.activity != null ? activityName(e!.activity) : "No activity"}
            {e!.feeling != null ? ` · ${feelings[e!.feeling]}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  heading: { fontSize: 28, fontWeight: "800", color: c.text, paddingHorizontal: 16, paddingTop: 4 },
  segmentWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" },
  segItem: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: c.card },
  segItemActive: { backgroundColor: c.primary },
  segText: { fontSize: 13, fontWeight: "600", color: c.textBody },
  segTextActive: { color: c.onPrimary },

  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { fontSize: 14, color: c.textFaint, textAlign: "center", marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  muted: { fontSize: 13, color: c.textFaint, fontStyle: "italic" },

  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryItem: { flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 12 },
  summaryValue: { fontSize: 18, fontWeight: "700", color: c.text },
  summaryLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },

  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.text },
  cardSubtitle: { fontSize: 12, color: c.textFaint, marginTop: 2 },
  cardBody: { marginTop: 12 },

  donutRow: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  donutLegend: { flex: 1, minWidth: 160, gap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { flex: 1, fontSize: 13, color: c.textBody },
  legendPct: { fontSize: 13, fontWeight: "600", color: c.textMuted },

  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  barLabel: { width: 90, fontSize: 13, color: c.textBody },
  barTrack: { flex: 1 },
  barValue: { width: 32, fontSize: 13, fontWeight: "600", color: c.text, textAlign: "right" },

  strip: { flexDirection: "row", gap: 1, marginBottom: 2 },
  stripCell: { flex: 1, height: 16, borderRadius: 2 },
  hourAxis: { flexDirection: "row", marginTop: 2 },
  hourAxisText: { flex: 1, fontSize: 8, color: c.textFaint, textAlign: "center" },

  heatCaption: { fontSize: 12, fontWeight: "700", color: c.textMuted, marginTop: 16, marginBottom: 8 },
  heatRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  heatLabel: { width: 70, fontSize: 10, color: c.textMuted },
  flex1: { flex: 1 },

  bestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  bestDate: { width: 84, fontSize: 13, fontWeight: "600", color: c.textBody },
  bestStrip: { flex: 1 },
  bestMood: { width: 32, fontSize: 13, fontWeight: "700", color: c.text, textAlign: "right" },
  detail: { backgroundColor: c.surface, borderRadius: 8, padding: 10, marginBottom: 8 },
  detailLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  detailHour: { width: 44, fontSize: 12, color: c.textMuted },
  detailDot: { width: 10, height: 10, borderRadius: 3 },
  detailText: { flex: 1, fontSize: 13, color: c.textBody },
});
