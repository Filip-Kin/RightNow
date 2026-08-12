// Deep catch-up flow. Two passes over the incomplete hours in the look-back window:
// first fill an ACTIVITY into every blank hour, then a FEELING into every non-sleep
// blank (Filip's workflow - remember what you were doing, then how you felt). Each
// step shows a small context grid (the hour's day plus 2 days either side) so you can
// orient yourself. The mood pass is (re)built when it begins, so hours you activitied
// in the first pass are picked up. See lib/catchup.ts for the pure logic.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Icon } from "@/components/Icon";
import ProgressIndicator from "@/components/ProgressIndicator";
import { getAllEntries, getEntry, setEntry, useEntries, useStoreLoaded, type LocalEntry } from "@/lib/entries";
import { getDEK, useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { hourRangeLabel } from "@/lib/time";
import {
  activityName, feelingIcons, feelings, getActivity, getContrastingTextColor, lightenColor, useActivities,
} from "@/lib/activities";
import { activityGapSlots, moodGapSlots, type CatchUpSlot } from "@/lib/catchup";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed 8/12", plus the year when it isn't the current year. */
function dateLabel(date: string, nowYear: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, mo - 1, d).getDay()];
  return y !== nowYear ? `${wd} ${mo}/${d}/${String(y).slice(2)}` : `${wd} ${mo}/${d}`;
}

export default function CatchUpScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const config = useConfig();
  const activities = useActivities();
  useAuth(); // re-render when the DEK arrives
  const storeLoaded = useStoreLoaded();
  const entries = useEntries(); // reactive: the context grid recolors as you fill
  const ready = storeLoaded && !!getDEK();
  const [now] = useState(() => Date.now());
  const nowYear = new Date(now).getFullYear();
  const horizon = config.catchUpDaysHorizon;

  const isSleep = useCallback(
    (idx: number) => !!activities.find((a) => a.index === idx)?.skipFeeling,
    [activities],
  );

  const [phase, setPhase] = useState<"activity" | "mood">("activity");
  const queueRef = useRef<CatchUpSlot[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [, force] = useState(0);
  const [selActivity, setSelActivity] = useState<number | null>(null);
  const [selFeeling, setSelFeeling] = useState<number>(-1);

  const leave = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace("/");
  }, [router]);

  // Build (or rebuild) the queue for the current phase. Runs when the phase changes;
  // the mood queue is computed here, i.e. AFTER the activity pass, so hours activitied
  // during that pass are included. An empty phase advances to the next (or exits).
  useEffect(() => {
    if (!ready) return;
    const all = getAllEntries();
    const q = phase === "activity"
      ? activityGapSlots(all, now, horizon)
      : moodGapSlots(all, now, horizon, isSleep);
    queueRef.current = q;
    setCursor(0);
    force((n) => n + 1);
    if (q.length === 0) {
      if (phase === "activity") setPhase("mood");
      else leave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, phase]);

  const queue = queueRef.current ?? [];
  const slot = queue[cursor];

  // Reflect any saved value for the slot (its other field, or a prior answer if you
  // stepped back) into the pickers.
  useEffect(() => {
    if (!slot) { setSelActivity(null); setSelFeeling(-1); return; }
    const e = getEntry(slot.date, slot.hour);
    setSelActivity(e?.activity ?? null);
    setSelFeeling(e?.feeling ?? -1);
  }, [cursor, slot?.date, slot?.hour, phase]);

  const advance = () => {
    const q = queueRef.current ?? [];
    if (cursor + 1 >= q.length) {
      if (phase === "activity") setPhase("mood"); // effect rebuilds the mood queue
      else leave();
    } else {
      setCursor((n) => n + 1);
    }
  };

  const onError = (e: unknown) => { console.error(e); alert(String(e)); };

  const submitActivity = (activityIndex: number | null) => {
    if (!slot) return;
    const prev = getEntry(slot.date, slot.hour);
    const sleep = activityIndex != null && isSleep(activityIndex);
    const feeling = sleep ? null : (prev?.feeling ?? null); // sleep never carries a mood
    setEntry(slot.date, slot.hour, activityIndex, feeling, "manual").catch(onError);
    advance();
  };

  const submitMood = (feelingIndex: number) => {
    if (!slot) return;
    const prev = getEntry(slot.date, slot.hour);
    setEntry(slot.date, slot.hour, prev?.activity ?? null, feelingIndex, "manual").catch(onError);
    advance();
  };

  // date -> hour -> entry, for the context grid (reactive on `entries`).
  const byDate = useMemo(() => {
    const m = new Map<string, Map<number, LocalEntry>>();
    for (const e of entries) {
      let h = m.get(e.date);
      if (!h) { h = new Map(); m.set(e.date, h); }
      h.set(e.hour, e);
    }
    return m;
  }, [entries]);

  const orderedActivities = [
    ...activities.filter((a) => !a.skipFeeling),
    ...activities.filter((a) => a.skipFeeling),
  ];

  if (!ready || !slot) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFill}><ActivityIndicator color={c.primary} /></View>
      </SafeAreaView>
    );
  }

  const isActivityPhase = phase === "activity";
  const contextActivity = selActivity != null ? getActivity(selActivity) : undefined;

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={leave} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={22} style={{ color: c.textMuted }} />
            </TouchableOpacity>
            <Text style={styles.title}>Catch up</Text>
            <View style={styles.closeBtn} />
          </View>
          <Text style={styles.phaseLabel}>
            {isActivityPhase ? "Filling in activities" : "Filling in feelings"} · {cursor + 1} of {queue.length}
          </Text>

          <Text style={styles.slotTime}>
            {dateLabel(slot.date, nowYear)} · {hourRangeLabel(slot.hour, config.hour24)}
          </Text>

          <ContextGrid centerDate={slot.date} targetHour={slot.hour} byDate={byDate} now={now} styles={styles} empty={c.empty} />

          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, cursor === 0 && styles.navBtnDisabled]}
              disabled={cursor === 0}
              onPress={() => cursor > 0 && setCursor((n) => n - 1)}
            >
              <Icon name="arrow-back" style={{ color: cursor === 0 ? c.textFaint : c.primary }} />
            </TouchableOpacity>
            <View style={styles.progressWrap}>
              <ProgressIndicator current={cursor} total={queue.length} />
            </View>
            <TouchableOpacity style={styles.skipBtn} onPress={advance}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {isActivityPhase ? (
            <>
              <Text style={styles.pickerLabel}>What were you doing?</Text>
              <View style={styles.activityGrid}>
                {orderedActivities.map((a) => (
                  <TouchableOpacity
                    key={a.index}
                    style={[
                      { backgroundColor: a.index === selActivity ? lightenColor(a.color, 20) : a.color, borderColor: a.color },
                      styles.activityButton,
                      a.index === selActivity && styles.activityButtonSelected,
                      a.skipFeeling ? { width: "100%" } : {},
                    ]}
                    onPress={() => submitActivity(a.index)}
                  >
                    <Icon style={{ color: getContrastingTextColor(a.color) }} name={a.icon} />
                    <Text style={{ color: getContrastingTextColor(a.color) }}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              {contextActivity && (
                <View style={styles.contextChip}>
                  <View style={[styles.contextDot, { backgroundColor: contextActivity.color }]} />
                  <Text style={styles.contextChipText}>You were doing: {activityName(selActivity!)}</Text>
                </View>
              )}
              <Text style={styles.pickerLabel}>How were you feeling?</Text>
              <View style={styles.feelingRow}>
                {feelings.map((f, i) => {
                  const color = selFeeling === i ? c.primary : c.text;
                  return (
                    <TouchableOpacity key={f} style={styles.feelingItem} onPress={() => submitMood(i)}>
                      <Text style={{ textAlign: "center", color, marginBottom: 2, fontWeight: "500", fontSize: 11 }}>{f}</Text>
                      {feelingIcons[i]({ color })}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

/** The hour's day plus 2 days either side (clipped to today), newest at top, activity-
 *  colored, with the target hour cell ringed - so you can place the hour in context. */
function ContextGrid({
  centerDate, targetHour, byDate, now, styles, empty,
}: {
  centerDate: string;
  targetHour: number;
  byDate: Map<string, Map<number, LocalEntry>>;
  now: number;
  styles: ReturnType<typeof makeStyles>;
  empty: string;
}) {
  const nowYear = new Date(now).getFullYear();
  const [cy, cmo, cd] = centerDate.split("-").map(Number);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const rows: { date: string; label: string; isTarget: boolean; hours: (LocalEntry | undefined)[] }[] = [];
  for (let off = 2; off >= -2; off--) {
    const d = new Date(cy, cmo - 1, cd); d.setDate(d.getDate() + off); d.setHours(0, 0, 0, 0);
    if (d.getTime() > todayStart.getTime()) continue; // no future days
    const date = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const hmap = byDate.get(date);
    rows.push({
      date,
      label: dateLabel(date, nowYear),
      isTarget: date === centerDate,
      hours: Array.from({ length: 24 }, (_, h) => hmap?.get(h)),
    });
  }

  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <View style={styles.gridDayCol} />
        {Array.from({ length: 24 }).map((_, h) => (
          <View key={h} style={styles.gridHeaderCell}>
            <Text style={styles.gridHeaderText}>{h % 6 === 0 ? h : ""}</Text>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.date} style={[styles.gridRow, row.isTarget && styles.gridRowTarget]}>
          <Text style={[styles.gridDayCol, styles.gridDayText, row.isTarget && styles.gridDayTextTarget]} numberOfLines={1}>
            {row.label}
          </Text>
          {row.hours.map((e, h) => {
            const bg = e && e.activity != null ? (getActivity(e.activity)?.color ?? "#9e9e9e") : empty;
            const isTargetCell = row.isTarget && h === targetHour;
            return <View key={h} style={[styles.gridCell, { backgroundColor: bg }, isTargetCell && styles.gridCellTarget]} />;
          })}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: c.text },
  phaseLabel: { fontSize: 13, fontWeight: "600", color: c.textMuted, textAlign: "center", marginTop: 2 },
  slotTime: { fontSize: 20, fontWeight: "700", color: c.text, textAlign: "center", marginTop: 14, marginBottom: 12 },

  grid: { backgroundColor: c.surface, borderRadius: 10, padding: 8, marginBottom: 12 },
  gridRow: { flexDirection: "row", alignItems: "center", height: 22 },
  gridRowTarget: { backgroundColor: c.primarySoft, borderRadius: 4 },
  gridDayCol: { width: 66, paddingHorizontal: 4 },
  gridDayText: { fontSize: 11, fontWeight: "600", color: c.textMuted },
  gridDayTextTarget: { color: c.text, fontWeight: "800" },
  gridHeaderCell: { flex: 1, alignItems: "center" },
  gridHeaderText: { fontSize: 8, color: c.textFaint },
  gridCell: { flex: 1, height: 14, marginHorizontal: 0.5, borderRadius: 2 },
  gridCellTarget: { boxShadow: `0 0 0 2px ${c.text}` },

  navRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  navBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.primarySoft },
  navBtnDisabled: { backgroundColor: c.surface2 },
  progressWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.surface },
  skipText: { color: c.textMuted, fontWeight: "700", fontSize: 14 },

  pickerLabel: { fontSize: 18, fontWeight: "bold", color: c.text, marginBottom: 14, textAlign: "center" },
  activityGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  activityButton: { borderWidth: 4, width: "48%", padding: 5, marginBottom: 10, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 5, flexDirection: "row", height: 64 },
  activityButtonSelected: { borderColor: c.text },

  contextChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 },
  contextDot: { width: 12, height: 12, borderRadius: 3 },
  contextChipText: { fontSize: 15, fontWeight: "600", color: c.textBody },
  feelingRow: { flexDirection: "row", justifyContent: "space-between" },
  feelingItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
});
