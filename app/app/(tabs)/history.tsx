// History: the big day-by-hour grid (rows = days, 24 columns = hours), echoing the
// original WAYDRN spreadsheet. Each cell is filled with the activity's color for
// that hour (or the feeling color, toggled). Tap a cell for its detail. Reads the
// local decrypted store (useEntries) + the custom taxonomy (useActivities).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Icon } from "@/components/Icon";
import { setEntry, setNote, sync, useEntries, useNotes, type LocalEntry } from "@/lib/entries";
import {
  activityName, feelingColors, feelingIcons, feelings, getActivity, getContrastingTextColor,
  lightenColor, useActivities, type ActivityDef,
} from "@/lib/activities";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

// A field choice in the cell editor: a value, null (clear it), or "keep" (leave
// each cell's current value untouched - the default for bulk edits).
type FieldChoice = number | null | "keep";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type ColorMode = "activity" | "feeling";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

interface DayRow {
  key: string;
  label: string; // "M/D"
  weekday: string;
  year: number;
  hours: (LocalEntry | undefined)[]; // 24
}

export default function HistoryScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const entries = useEntries();
  const notes = useNotes();
  const activities = useActivities(); // re-render on taxonomy edits (colors/names)
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState<ColorMode>("activity");
  // Infinite scroll: render the most recent `dayCount` days, append older pages as
  // you scroll down. Capped at the earliest day that has any data.
  const DAYS_PER_PAGE = 90;
  const [dayCount, setDayCount] = useState(DAYS_PER_PAGE);
  // Grid zoom (pinch): bigger cells = easier touch targets. zoom 1 fits the screen
  // width; higher zooms make the grid wider than the screen and scroll horizontally.
  const [zoom, setZoom] = useState(1);
  const { width: winW } = useWindowDimensions();
  const LABEL_W = 46;
  const ROW_PAD = 12;
  const GAP = 0.5 * zoom; // per-side cell margin, scaled so the gridlines persist when zoomed
  const cellW = Math.max(7, (winW - LABEL_W - ROW_PAD * 2) / 24) * zoom; // column width incl. gap
  const cellH = 16 * zoom;
  const gridW = ROW_PAD * 2 + LABEL_W + cellW * 24;

  const pinchStart = useRef(1);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => { pinchStart.current = zoom; })
        .onUpdate((e) => {
          const z = Math.min(4, Math.max(1, pinchStart.current * e.scale));
          setZoom(Math.round(z * 20) / 20);
        }),
    [zoom],
  );
  const [hovered, setHovered] = useState<{ date: string; hour: number; entry?: LocalEntry } | null>(null);
  const [noteDate, setNoteDate] = useState<string | null>(null); // day whose note is being edited

  // Bulk range selection (rows are indexed newest-first). Tap an anchor cell then
  // a second cell to span the rectangle between them; a third tap restarts.
  const [selectMode, setSelectMode] = useState(false);
  const [selAnchor, setSelAnchor] = useState<{ d: number; h: number } | null>(null);
  const [selEnd, setSelEnd] = useState<{ d: number; h: number } | null>(null);
  // The cell editor (single tapped cell, or the bulk selection).
  const [editor, setEditor] = useState<{ cells: { date: string; hour: number }[]; activity: number | null; feeling: number | null; bulk: boolean; title: string } | null>(null);

  // Hover (web) selects + previews a cell; clicking it opens the editor.
  const shown = hovered;

  const selRect = useMemo(() => {
    const end = selEnd ?? selAnchor;
    if (!selAnchor || !end) return null;
    return {
      d0: Math.min(selAnchor.d, end.d), d1: Math.max(selAnchor.d, end.d),
      h0: Math.min(selAnchor.h, end.h), h1: Math.max(selAnchor.h, end.h),
    };
  }, [selAnchor, selEnd]);
  const inSel = (d: number, h: number) => selRect != null && d >= selRect.d0 && d <= selRect.d1 && h >= selRect.h0 && h <= selRect.h1;
  const selCount = selRect ? (selRect.d1 - selRect.d0 + 1) * (selRect.h1 - selRect.h0 + 1) : 0;

  function clearSelection() {
    setSelAnchor(null);
    setSelEnd(null);
  }
  function toggleSelectMode() {
    setSelectMode((s) => !s);
    clearSelection();
  }
  function onCellPress(dayIdx: number, item: DayRow, h: number, e?: LocalEntry) {
    if (!selectMode) { openSingleEditor({ date: item.key, hour: h, entry: e }); return; }
    if (!selAnchor || selEnd) { setSelAnchor({ d: dayIdx, h }); setSelEnd(null); } // start fresh
    else setSelEnd({ d: dayIdx, h }); // complete the rectangle
  }
  function openBulkEditor() {
    if (!selRect) return;
    const cells: { date: string; hour: number }[] = [];
    for (let d = selRect.d0; d <= selRect.d1; d++) {
      for (let h = selRect.h0; h <= selRect.h1; h++) cells.push({ date: rows[d].key, hour: h });
    }
    setEditor({ cells, activity: null, feeling: null, bulk: true, title: `${cells.length} hour${cells.length === 1 ? "" : "s"}` });
  }
  function openSingleEditor(s: { date: string; hour: number; entry?: LocalEntry }) {
    const [y, mo, d] = s.date.split("-").map(Number);
    const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    setEditor({
      cells: [{ date: s.date, hour: s.hour }],
      activity: s.entry?.activity ?? null,
      feeling: s.entry?.feeling ?? null,
      bulk: false,
      title: `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d} · ${h12(s.hour)}`,
    });
  }
  async function applyEditor(act: FieldChoice, feel: FieldChoice) {
    if (!editor) return;
    for (const c of editor.cells) {
      const existing = byDate.get(c.date)?.get(c.hour);
      const activity = act === "keep" ? (existing?.activity ?? null) : act;
      const feeling = feel === "keep" ? (existing?.feeling ?? null) : feel;
      await setEntry(c.date, c.hour, activity, feeling);
    }
    setEditor(null);
    clearSelection();
  }

  // Single-cell: save but keep the dialog open so the arrows can step through cells.
  async function saveSingle(activity: number | null, feeling: number | null) {
    if (!editor || editor.bulk) return;
    const cell = editor.cells[0];
    await setEntry(cell.date, cell.hour, activity, feeling);
    setEditor((e) => (e && !e.bulk ? { ...e, activity, feeling } : e));
  }
  // Move the single-cell editor to the adjacent hour (wraps across days). Won't
  // step into a not-yet-elapsed hour.
  function navEditor(dir: -1 | 1) {
    if (!editor || editor.bulk) return;
    const cur = editor.cells[0];
    const [y, mo, d] = cur.date.split("-").map(Number);
    const dt = new Date(y, mo - 1, d, cur.hour);
    dt.setHours(dt.getHours() + dir);
    if (dt.getTime() > Date.now()) return;
    const ndate = `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
    openSingleEditor({ date: ndate, hour: dt.getHours(), entry: byDate.get(ndate)?.get(dt.getHours()) });
  }
  function canStepNext(cell: { date: string; hour: number }): boolean {
    const [y, mo, d] = cell.date.split("-").map(Number);
    const dt = new Date(y, mo - 1, d, cell.hour + 1);
    return dt.getTime() <= Date.now();
  }

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

  // The oldest day that has any data; we stop infinite scroll there.
  const maxDays = useMemo(() => {
    let earliest = Infinity;
    for (const e of entries) {
      const [y, mo, d] = e.date.split("-").map(Number);
      const t = new Date(y, mo - 1, d).getTime();
      if (t < earliest) earliest = t;
    }
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    if (!Number.isFinite(earliest)) return 30;
    return Math.max(30, Math.floor((todayStart.getTime() - earliest) / 86400000) + 1);
  }, [entries, now]);

  // Build the day rows newest-first, up to the current page (capped at maxDays).
  const rows = useMemo<DayRow[]>(() => {
    const out: DayRow[] = [];
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const n = Math.min(dayCount, maxDays);
    for (let i = 0; i < n; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = dayKey(d);
      const hmap = byDate.get(key);
      const hours: (LocalEntry | undefined)[] = [];
      for (let h = 0; h < 24; h++) hours.push(hmap?.get(h));
      out.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WEEKDAYS[d.getDay()], year: d.getFullYear(), hours });
    }
    return out;
  }, [byDate, dayCount, maxDays, now]);

  function cellColor(e: LocalEntry | undefined): string {
    if (!e) return c.empty;
    if (mode === "feeling") return e.feeling != null ? feelingColors[e.feeling] : c.empty;
    return e.activity != null ? (getActivity(e.activity)?.color ?? "#9e9e9e") : c.empty;
  }

  return (
    <ScreenContainer maxWidth={1100}>
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.heading}>History</Text>

      <View style={styles.controls}>
        <View style={styles.controlsRight}>
          <TouchableOpacity style={[styles.modeBtn, selectMode && styles.modeBtnActive]} onPress={toggleSelectMode}>
            <Text style={[styles.modeText, selectMode && styles.modeTextActive]}>{selectMode ? "Done" : "Select"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modeBtn} onPress={() => router.push("/year")}>
            <Text style={styles.modeText}>Year ▸</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modeBtn}
            onPress={() => setMode((m) => (m === "activity" ? "feeling" : "activity"))}
          >
            <Text style={styles.modeText}>{mode === "activity" ? "Activity" : "Feeling"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Pinch to zoom; horizontal scroll when the grid is wider than the screen.
          The header and rows share fixed widths so columns stay aligned. The list
          scrolls back through history, appending older pages (year headers mark the
          boundaries). */}
      <GestureDetector gesture={pinch}>
        <ScrollView horizontal showsHorizontalScrollIndicator={zoom > 1} bounces={false}>
          <View style={{ width: gridW, flex: 1 }}>
            <View style={[styles.headerRow, { width: gridW }]}>
              <View style={styles.dayLabelCol} />
              {Array.from({ length: 24 }).map((_, h) => (
                <View key={h} style={[styles.headerCell, { width: cellW }]}>
                  <Text style={styles.headerText}>{h % 3 === 0 ? h : ""}</Text>
                </View>
              ))}
            </View>

            <FlatList
              data={rows}
              keyExtractor={(r) => r.key}
              initialNumToRender={40}
              windowSize={11}
              style={{ width: gridW }}
              onEndReachedThreshold={1.5}
              onEndReached={() => setDayCount((n) => Math.min(maxDays, n + DAYS_PER_PAGE))}
              renderItem={({ item, index }) => {
                const showYear = index === 0 || rows[index - 1].year !== item.year;
                return (
                  <>
                    {showYear && (
                      <View style={[styles.yearHeader, { width: gridW }]}>
                        <Text style={styles.yearHeaderText}>{item.year}</Text>
                      </View>
                    )}
                    <View style={[styles.dayRow, { width: gridW }]}>
                      <TouchableOpacity
                        style={[styles.dayLabelCol, notes[item.key] && styles.dayLabelNote]}
                        onPress={() => setNoteDate(item.key)}
                      >
                        <Text style={styles.dayLabel} numberOfLines={1}>
                          {item.label}{notes[item.key] ? <Text style={styles.noteDot}> ●</Text> : null}
                        </Text>
                        <Text style={styles.dayWeekday}>{item.weekday}</Text>
                      </TouchableOpacity>
                      {item.hours.map((e, h) => (
                        <Pressable
                          key={h}
                          style={[
                            styles.cell,
                            { backgroundColor: cellColor(e), width: cellW - GAP, height: cellH, marginHorizontal: GAP / 2 },
                            !selectMode && shown?.date === item.key && shown?.hour === h && styles.cellSelected,
                            inSel(index, h) && styles.cellInSel,
                          ]}
                          onPress={() => onCellPress(index, item, h, e)}
                          onHoverIn={() => { if (!selectMode) setHovered({ date: item.key, hour: h, entry: e }); }}
                          onHoverOut={() => { if (!selectMode) setHovered(null); }}
                        />
                      ))}
                    </View>
                  </>
                );
              }}
              ListFooterComponent={<Legend mode={mode} />}
            />
          </View>
        </ScrollView>
      </GestureDetector>

      {!selectMode && shown && (
        <DetailBar selected={shown} note={notes[shown.date]} />
      )}
      {selectMode && (
        <View style={styles.selBar}>
          <Text style={styles.selBarText}>
            {selRect ? `${selCount} hour${selCount === 1 ? "" : "s"} selected` : "Tap a cell, then another to span a range"}
          </Text>
          {selRect && (
            <View style={styles.selBarActions}>
              <TouchableOpacity onPress={clearSelection} style={styles.selClear}>
                <Text style={styles.selClearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openBulkEditor} style={styles.selEdit}>
                <Text style={styles.selEditText}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {editor && (
        <CellEditor
          cellKey={editor.bulk ? "bulk" : `${editor.cells[0].date}-${editor.cells[0].hour}`}
          title={editor.title}
          bulk={editor.bulk}
          activities={activities}
          initialActivity={editor.activity}
          initialFeeling={editor.feeling}
          onApply={applyEditor}
          onClose={() => setEditor(null)}
          onSave={editor.bulk ? undefined : saveSingle}
          onPrev={editor.bulk ? undefined : () => navEditor(-1)}
          onNext={editor.bulk ? undefined : () => navEditor(1)}
          canNext={editor.bulk ? false : canStepNext(editor.cells[0])}
        />
      )}
      {noteDate && <NoteEditor date={noteDate} initial={notes[noteDate] ?? ""} onClose={() => setNoteDate(null)} />}
    </SafeAreaView>
    </ScreenContainer>
  );
}

function NoteEditor({ date, initial, onClose }: { date: string; initial: string; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState(initial);
  const [y, mo, d] = date.split("-").map(Number);
  const label = `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d}`;
  function save() {
    setNote(date, text.trim());
    onClose();
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.noteBackdrop}>
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Note · {label}</Text>
          <Text style={styles.noteHint}>What did you do this day? Anything worth remembering.</Text>
          <TextInput
            style={styles.noteInput}
            value={text}
            onChangeText={setText}
            placeholder="e.g. FRC district event, dentist, road trip…"
            multiline
            autoFocus
          />
          <View style={styles.noteActions}>
            <TouchableOpacity style={styles.noteCancel} onPress={onClose}>
              <Text style={styles.noteCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.noteSave} onPress={save}>
              <Text style={styles.noteSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}


function DetailBar({ selected, note }: { selected: { date: string; hour: number; entry?: LocalEntry }; note?: string }) {
  const styles = useThemedStyles(makeStyles);
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
        {note ? <Text style={styles.detailNote} numberOfLines={2}>📝 {note}</Text> : null}
      </View>
      <Text style={styles.detailHint}>click to edit</Text>
    </View>
  );
}

// Activity + feeling picker, styled to match the log submission screen. For a
// single cell it auto-saves once both an activity and a feeling are chosen (or
// instantly for a skip-feeling activity), like logging. For a bulk selection
// each field also offers "Keep" (leave each cell's value as-is) + "Clear", and
// applies on the Apply button. Both fields are a FieldChoice (value | null | "keep").
function CellEditor({
  cellKey, title, bulk, activities, initialActivity, initialFeeling, onApply, onClose,
  onSave, onPrev, onNext, canNext,
}: {
  cellKey: string;
  title: string;
  bulk: boolean;
  activities: ActivityDef[];
  initialActivity: number | null;
  initialFeeling: number | null;
  onApply: (activity: FieldChoice, feeling: FieldChoice) => void;
  onClose: () => void;
  onSave?: (activity: number | null, feeling: number | null) => void;
  onPrev?: () => void;
  onNext?: () => void;
  canNext?: boolean;
}) {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [act, setAct] = useState<FieldChoice>(bulk ? "keep" : initialActivity);
  const [feel, setFeel] = useState<FieldChoice>(bulk ? "keep" : initialFeeling);
  // Arrows move to an adjacent cell without remounting the Modal (no fade flicker);
  // reset the staged selection to the new cell's values when it changes.
  useEffect(() => {
    setAct(bulk ? "keep" : initialActivity);
    setFeel(bulk ? "keep" : initialFeeling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey]);

  // Single-cell: save on each pick but keep the dialog open (so the arrows can
  // step through cells). Bulk: just stage the choice for the Apply button.
  function pickActivity(a: ActivityDef) {
    if (bulk) { setAct(a.index); return; }
    setAct(a.index);
    if (a.skipFeeling) { setFeel(null); onSave?.(a.index, null); }
    else if (typeof feel === "number") onSave?.(a.index, feel);
  }
  function pickFeeling(i: number) {
    if (bulk) { setFeel(i); return; }
    setFeel(i);
    if (typeof act === "number") onSave?.(act, i);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.editBackdrop}>
        <View style={styles.editCard}>
          {bulk ? (
            <Text style={styles.editTitle}>{title}</Text>
          ) : (
            <View style={styles.editTitleRow}>
              <TouchableOpacity style={styles.navArrow} onPress={onPrev}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.editTitle, styles.editTitleCenter]} numberOfLines={1}>{title}</Text>
              <TouchableOpacity style={[styles.navArrow, !canNext && styles.navArrowDisabled]} disabled={!canNext} onPress={onNext}>
                <Text style={styles.navArrowText}>›</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.editLabel}>Select an Activity:</Text>
          <View style={styles.activityGrid}>
            {bulk && (
              <TouchableOpacity style={[styles.neutralButton, act === "keep" && styles.neutralButtonActive]} onPress={() => setAct("keep")}>
                <Text style={styles.neutralButtonText}>Keep</Text>
              </TouchableOpacity>
            )}
            {activities.map((a) => (
              <TouchableOpacity
                key={a.index}
                style={[
                  { backgroundColor: act === a.index ? lightenColor(a.color, 20) : a.color, borderColor: a.color },
                  styles.activityButton,
                  act === a.index && styles.activityButtonSelected,
                ]}
                onPress={() => pickActivity(a)}
              >
                <Icon style={{ color: getContrastingTextColor(a.color) }} name={a.icon} />
                <Text style={{ color: getContrastingTextColor(a.color) }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.neutralButton, act === null && styles.neutralButtonActive]} onPress={() => setAct(null)}>
              <Text style={styles.neutralButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.editLabel}>How are you feeling?</Text>
          <View style={styles.feelingRow}>
            {bulk && (
              <TouchableOpacity style={styles.feelingItem} onPress={() => setFeel("keep")}>
                <Text style={[styles.feelingKeep, feel === "keep" && styles.feelingKeepActive]}>Keep</Text>
              </TouchableOpacity>
            )}
            {feelings.map((f, i) => {
              const color = feel === i ? c.primary : c.text;
              return (
                <TouchableOpacity key={f} style={styles.feelingItem} onPress={() => pickFeeling(i)}>
                  <Text style={{ textAlign: "center", color, marginBottom: 2, fontWeight: "500", fontSize: 11 }}>{f}</Text>
                  {feelingIcons[i]({ color })}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.feelingItem} onPress={() => setFeel(null)}>
              <Text style={[styles.feelingKeep, feel === null && styles.feelingKeepActive]}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.editActions}>
            {bulk ? (
              <>
                <TouchableOpacity style={styles.noteCancel} onPress={onClose}>
                  <Text style={styles.noteCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noteSave} onPress={() => onApply(act, feel)}>
                  <Text style={styles.noteSaveText}>{`Apply to ${title}`}</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Single-cell auto-saves on each pick; this just closes.
              <TouchableOpacity style={styles.noteSave} onPress={onClose}>
                <Text style={styles.noteSaveText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Legend({ mode }: { mode: ColorMode }) {
  const styles = useThemedStyles(makeStyles);
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

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  heading: { fontSize: 28, fontWeight: "800", color: c.text, paddingHorizontal: 16, paddingTop: 4 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10, flexWrap: "wrap", gap: 8 },
  controlsRight: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: "hidden" },
  segItem: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: c.card },
  segItemActive: { backgroundColor: c.primary },
  segText: { fontSize: 13, fontWeight: "600", color: c.textBody },
  segTextActive: { color: c.onPrimary },
  modeBtn: { borderWidth: 1, borderColor: c.primary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  modeBtnActive: { backgroundColor: c.primary },
  modeText: { color: c.primary, fontWeight: "600", fontSize: 13 },
  modeTextActive: { color: c.onPrimary },

  headerRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "flex-end", marginBottom: 2 },
  yearHeader: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4 },
  yearHeaderText: { fontSize: 13, fontWeight: "800", color: c.textMuted, letterSpacing: 1 },
  headerCell: { flex: 1, alignItems: "center" },
  headerText: { fontSize: 8, color: c.textFaint },
  dayRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "center", marginBottom: 2 },
  dayLabelCol: { width: 46, paddingVertical: 1, paddingHorizontal: 3, borderRadius: 4 },
  dayLabelNote: { backgroundColor: c.noteHighlight, borderWidth: 1, borderColor: c.noteBorder }, // a day with a note gets a highlighted date box
  noteDot: { fontSize: 7, color: c.noteDot },
  dayLabel: { fontSize: 11, fontWeight: "600", color: c.textBody },
  dayWeekday: { fontSize: 9, color: c.textFaint },
  // Ring via boxShadow rather than a border so selecting a cell doesn't resize it
  // (a border would shrink the box and shift the row's layout).
  cell: { flex: 1, height: 16, marginHorizontal: 0.5, borderRadius: 2 },
  cellSelected: { boxShadow: `0 0 0 2px ${c.text}` },
  cellInSel: { boxShadow: `0 0 0 2px ${c.primary}` },

  detail: { flexDirection: "row", alignItems: "center", padding: 14, borderTopWidth: 1, borderTopColor: c.borderFaint, backgroundColor: c.surfaceAlt },
  detailTitle: { fontSize: 14, fontWeight: "700", color: c.text },
  detailBody: { fontSize: 14, color: c.textBody, marginTop: 2 },
  detailEmpty: { fontSize: 14, color: c.textFaint, marginTop: 2, fontStyle: "italic" },
  detailNote: { fontSize: 13, color: c.textBody, marginTop: 4 },
  detailHint: { fontSize: 12, color: c.textFaint, fontStyle: "italic" },

  selBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderTopWidth: 1, borderTopColor: c.borderFaint, backgroundColor: c.surfaceAlt },
  selBarText: { fontSize: 14, fontWeight: "600", color: c.textBody, flex: 1 },
  selBarActions: { flexDirection: "row", gap: 10 },
  selClear: { paddingVertical: 8, paddingHorizontal: 12 },
  selClearText: { color: c.textMuted, fontWeight: "600", fontSize: 14 },
  selEdit: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18 },
  selEditText: { color: c.onPrimary, fontWeight: "700", fontSize: 14 },

  // Cell editor, mirroring the log submission screen.
  editBackdrop: { flex: 1, backgroundColor: c.backdrop, justifyContent: "center", padding: 20 },
  editCard: { backgroundColor: c.card, borderRadius: 14, padding: 20, maxHeight: "90%" },
  editTitle: { fontSize: 18, fontWeight: "700", color: c.text, textAlign: "center", marginBottom: 12 },
  editTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  editTitleCenter: { flex: 1, marginBottom: 0 },
  navArrow: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  navArrowDisabled: { opacity: 0.3 },
  navArrowText: { fontSize: 28, color: c.text, lineHeight: 30, fontWeight: "700" },
  editLabel: { fontSize: 18, fontWeight: "bold", color: c.text, marginBottom: 12 },
  activityGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 16 },
  activityButton: { borderWidth: 4, width: "48%", padding: 5, marginBottom: 10, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 5, flexDirection: "row", height: 56 },
  activityButtonSelected: { borderColor: c.text },
  neutralButton: { width: "48%", height: 56, marginBottom: 10, borderRadius: 5, borderWidth: 4, borderColor: c.border, backgroundColor: c.cardBorder, alignItems: "center", justifyContent: "center" },
  neutralButtonActive: { borderColor: c.text },
  neutralButtonText: { color: c.textBody, fontWeight: "600" },
  feelingRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  feelingItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  feelingKeep: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  feelingKeepActive: { color: c.primary },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 4 },

  noteBackdrop: { flex: 1, backgroundColor: c.backdrop, justifyContent: "center", padding: 24 },
  noteCard: { backgroundColor: c.card, borderRadius: 14, padding: 20 },
  noteTitle: { fontSize: 18, fontWeight: "700", color: c.text },
  noteHint: { fontSize: 13, color: c.textMuted, marginTop: 4, marginBottom: 12 },
  noteInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 12, fontSize: 15, color: c.text, backgroundColor: c.inputBg, minHeight: 90, textAlignVertical: "top" },
  noteActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  noteCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  noteCancelText: { color: c.textMuted, fontSize: 16, fontWeight: "600" },
  noteSave: { backgroundColor: c.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  noteSaveText: { color: c.onPrimary, fontSize: 16, fontWeight: "700" },

  legend: { marginTop: 12, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 12, color: c.textBody },
});
