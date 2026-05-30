// Wakatime-style date-range picker: a trigger chip that opens presets + a custom
// calendar. Single scrollable month on mobile (prev/next), tap start then end.
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { customRange, PRESETS, presetRange, rangeLabel, type DateRange } from "@/lib/dateRange";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMs = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

export function DateRangePicker({ value, onChange, now }: { value: DateRange; onChange: (r: DateRange) => void; now: number }) {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = new Date(value.startMs); d.setDate(1); return d; });
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  function close() { setOpen(false); setCustom(false); setStart(null); setEnd(null); }
  function pickPreset(key: Parameters<typeof presetRange>[0]) { onChange(presetRange(key, now)); close(); }

  function tapDay(ms: number) {
    if (start === null || end !== null) { setStart(ms); setEnd(null); }
    else if (ms < start) { setStart(ms); }
    else { setEnd(ms); }
  }
  function applyCustom() {
    if (start === null) return;
    onChange(customRange(new Date(start), new Date(end ?? start)));
    close();
  }

  // Build the displayed month grid.
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstWd = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(dayMs(new Date(year, month, d)));
  const selLo = start, selHi = end ?? start;

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={styles.triggerText}>{rangeLabel(value, now)}</Text>
        <Text style={styles.triggerCaret}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            {!custom ? (
              <ScrollView>
                {PRESETS.map((p) => {
                  const r = presetRange(p.key, now);
                  const active = r.startMs === value.startMs && r.endMs === value.endMs;
                  return (
                    <TouchableOpacity key={p.key} style={[styles.preset, active && styles.presetActive]} onPress={() => pickPreset(p.key)}>
                      <Text style={[styles.presetText, active && styles.presetTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={styles.preset} onPress={() => setCustom(true)}>
                  <Text style={[styles.presetText, { color: c.primary }]}>Custom Range ▸</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View>
                <View style={styles.calHeader}>
                  <TouchableOpacity onPress={() => setCursor(new Date(year, month - 1, 1))} style={styles.calNav}><Text style={styles.calNavText}>‹</Text></TouchableOpacity>
                  <Text style={styles.calMonth}>{MONTHS[month]} {year}</Text>
                  <TouchableOpacity onPress={() => setCursor(new Date(year, month + 1, 1))} style={styles.calNav}><Text style={styles.calNavText}>›</Text></TouchableOpacity>
                </View>
                <View style={styles.calRow}>
                  {WD.map((w) => <Text key={w} style={styles.calWd}>{w}</Text>)}
                </View>
                <View style={styles.calGrid}>
                  {cells.map((ms, i) => {
                    if (ms === null) return <View key={i} style={styles.calCell} />;
                    const inRange = selLo !== null && selHi !== null && ms >= selLo && ms <= selHi;
                    const isEnd = ms === selLo || ms === selHi;
                    return (
                      <TouchableOpacity key={i} style={[styles.calCell, inRange && styles.calIn, isEnd && styles.calEnd]} onPress={() => tapDay(ms)}>
                        <Text style={[styles.calDay, (inRange || isEnd) && styles.calDayActive]}>{new Date(ms).getDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.calHint}>
                  {start === null ? "Tap a start day" : end === null ? "Tap an end day" : `${MONTHS[new Date(start).getMonth()]} ${new Date(start).getDate()} – ${MONTHS[new Date(end).getMonth()]} ${new Date(end).getDate()}`}
                </Text>
                <View style={styles.calActions}>
                  <TouchableOpacity style={styles.btnGhost} onPress={() => setCustom(false)}><Text style={styles.btnGhostText}>Back</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.btnApply, start === null && styles.btnDisabled]} disabled={start === null} onPress={applyCustom}>
                    <Text style={styles.btnApplyText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, alignSelf: "flex-start", backgroundColor: c.card },
  triggerText: { color: c.text, fontWeight: "600", fontSize: 14 },
  triggerCaret: { color: c.textMuted, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: c.backdrop, justifyContent: "center", padding: 24 },
  card: { backgroundColor: c.card, borderRadius: 14, padding: 8, maxHeight: "80%", maxWidth: 360, width: "100%", alignSelf: "center" },
  preset: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8 },
  presetActive: { backgroundColor: c.primary },
  presetText: { fontSize: 15, color: c.text },
  presetTextActive: { color: c.onPrimary, fontWeight: "700" },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 },
  calNav: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  calNavText: { fontSize: 24, color: c.primary, fontWeight: "700" },
  calMonth: { fontSize: 16, fontWeight: "700", color: c.text },
  calRow: { flexDirection: "row" },
  calWd: { flex: 1, textAlign: "center", color: c.textFaint, fontSize: 12, paddingVertical: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calIn: { backgroundColor: c.primarySoft },
  calEnd: { backgroundColor: c.primary, borderRadius: 8 },
  calDay: { fontSize: 14, color: c.text },
  calDayActive: { color: c.onPrimary, fontWeight: "700" },
  calHint: { textAlign: "center", color: c.textMuted, fontSize: 13, paddingVertical: 10 },
  calActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, padding: 8 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 16 },
  btnGhostText: { color: c.textMuted, fontWeight: "600", fontSize: 15 },
  btnApply: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  btnDisabled: { opacity: 0.5 },
  btnApplyText: { color: c.onPrimary, fontWeight: "700", fontSize: 15 },
});
