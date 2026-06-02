// History: the big day-by-hour grid (rows = days, 24 columns = hours), echoing the
// original WAYDRN spreadsheet. Each cell is filled with the activity's color for
// that hour (or the feeling color, toggled). Tap a cell for its detail. Reads the
// local decrypted store (useEntries) + the custom taxonomy (useActivities).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Icon } from "@/components/Icon";
import { setEntry, setNote, sync, useEntries, useNotes, type LocalEntry } from "@/lib/entries";
import {
  activityName, feelingColors, feelingIcons, feelings, getActivity, getContrastingTextColor,
  lightenColor, useActivities, type ActivityDef,
} from "@/lib/activities";
import { useConfig } from "@/lib/config";
import { hourRangeLabel } from "@/lib/time";
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

// Fixed list-item heights so FlatList places rows by offset (getItemLayout) instead
// of async onLayout measurement - the latter drifts on fast scroll and was causing
// rows to overlap/duplicate. These MUST match the explicit heights set on dayRow /
// yearHeader in the styles below.
const DAY_H = 28;
const YEAR_H = 56;

// Flat list model: a day row, or a year divider between two years.
type ListItem =
  | { type: "year"; key: string; year: number }
  | { type: "day"; key: string; row: DayRow; dayIndex: number };

function computeCellColor(e: LocalEntry | undefined, mode: ColorMode, emptyColor: string): string {
  if (!e) return emptyColor;
  if (mode === "feeling") return e.feeling != null ? feelingColors[e.feeling] : emptyColor;
  return e.activity != null ? (getActivity(e.activity)?.color ?? "#9e9e9e") : emptyColor;
}

// One day's 24-hour row, memoized so scrolling and unrelated state changes don't
// re-render every row - only rows whose data, mode, note flag, hovered cell, or the
// taxonomy (`activities`, compared by ref to refresh colors on edit) actually change.
const DayGridRow = React.memo(function DayGridRow(props: {
  row: DayRow; dayIndex: number; styles: ReturnType<typeof makeStyles>; mode: ColorMode; activities: ActivityDef[];
  emptyColor: string; shownHour: number; hasNote: boolean;
  onCell: (dayIdx: number, row: DayRow, h: number, e?: LocalEntry) => void;
  onHoverIn: (date: string, hour: number, e?: LocalEntry) => void;
  onHoverOut: () => void;
  onNote: (key: string) => void;
}) {
  const { row, dayIndex, styles, mode, emptyColor, shownHour, hasNote, onCell, onHoverIn, onHoverOut, onNote } = props;
  return (
    <View style={styles.dayRow}>
      <TouchableOpacity
        style={[styles.dayLabelCol, hasNote && styles.dayLabelNote]}
        onPress={() => onNote(row.key)}
      >
        <Text style={styles.dayLabel} numberOfLines={1}>
          {row.label}{hasNote ? <Text style={styles.noteDot}> ●</Text> : null}
        </Text>
        <Text style={styles.dayWeekday}>{row.weekday}</Text>
      </TouchableOpacity>
      {row.hours.map((e, h) => (
        <Pressable
          key={h}
          style={[styles.cell, { backgroundColor: computeCellColor(e, mode, emptyColor) }, shownHour === h && styles.cellSelected]}
          onPress={() => onCell(dayIndex, row, h, e)}
          onHoverIn={() => onHoverIn(row.key, h, e)}
          onHoverOut={onHoverOut}
        />
      ))}
    </View>
  );
});

export default function HistoryScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const entries = useEntries();
  const notes = useNotes();
  const activities = useActivities(); // re-render on taxonomy edits (colors/names)
  const config = useConfig();
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState<ColorMode>("activity");
  // Infinite scroll: render the most recent `dayCount` days, append older pages as
  // you scroll down. Capped at the earliest day that has any data.
  const DAYS_PER_PAGE = 45;
  const [dayCount, setDayCount] = useState(DAYS_PER_PAGE);
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
  // Stable callbacks so memoized DayGridRows don't re-render on every parent render.
  const onCell = useCallback((dayIdx: number, item: DayRow, h: number, e?: LocalEntry) => {
    if (!selectMode) { openSingleEditor({ date: item.key, hour: h, entry: e }); return; }
    if (!selAnchor || selEnd) { setSelAnchor({ d: dayIdx, h }); setSelEnd(null); } // start fresh
    else setSelEnd({ d: dayIdx, h }); // complete the rectangle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, selAnchor, selEnd]);
  const onHoverIn = useCallback((date: string, hour: number, e?: LocalEntry) => setHovered({ date, hour, entry: e }), []);
  const onHoverOut = useCallback(() => setHovered(null), []);
  const onNote = useCallback((key: string) => setNoteDate(key), []);
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
    setEditor({
      cells: [{ date: s.date, hour: s.hour }],
      activity: s.entry?.activity ?? null,
      feeling: s.entry?.feeling ?? null,
      bulk: false,
      title: `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d} · ${hourRangeLabel(s.hour, config.hour24)}`,
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

  // Flatten the day rows into the list model, inserting a year divider at each
  // year boundary. Single-element items (not a Fragment) so FlatList measures each
  // cell correctly.
  const listData = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let prevYear: number | null = null;
    rows.forEach((row, i) => {
      if (row.year !== prevYear) { out.push({ type: "year", key: `y-${row.year}`, year: row.year }); prevYear = row.year; }
      out.push({ type: "day", key: row.key, row, dayIndex: i });
    });
    return out;
  }, [rows]);

  // Cumulative offsets so getItemLayout can place items without onLayout measurement.
  const offsets = useMemo(() => {
    const arr: number[] = new Array(listData.length);
    let off = 0;
    for (let i = 0; i < listData.length; i++) { arr[i] = off; off += listData[i].type === "year" ? YEAR_H : DAY_H; }
    return arr;
  }, [listData]);
  const getItemLayout = useCallback(
    (_: ArrayLike<ListItem> | null | undefined, index: number) => ({
      length: listData[index]?.type === "year" ? YEAR_H : DAY_H,
      offset: offsets[index] ?? 0,
      index,
    }),
    [listData, offsets],
  );

  // Append the next page; the ref guards against a burst of onEndReached events
  // skipping ahead multiple pages at once. Reset once the new page has rendered.
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = false; }, [dayCount]);
  const loadMore = useCallback(() => {
    if (loadingRef.current || dayCount >= maxDays) return;
    loadingRef.current = true;
    setDayCount((n) => Math.min(maxDays, n + DAYS_PER_PAGE));
  }, [dayCount, maxDays]);

  return (
    <ScreenContainer maxWidth={1100}>
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <Text style={styles.heading}>History</Text>
        <TouchableOpacity
          style={styles.modeBtn}
          onPress={() => setMode((m) => (m === "activity" ? "feeling" : "activity"))}
        >
          <Text style={styles.modeText}>{mode === "activity" ? "Activity" : "Feeling"}</Text>
        </TouchableOpacity>
      </View>

      {/* Hour header; columns are flex so they fit the screen width. */}
      <View style={styles.headerRow}>
        <View style={styles.dayLabelCol} />
        {Array.from({ length: 24 }).map((_, h) => (
          <View key={h} style={styles.headerCell}>
            <Text style={styles.headerText}>{h % 3 === 0 ? h : ""}</Text>
          </View>
        ))}
      </View>

      {/* Infinite scroll back through history; year headers mark the boundaries. */}
      <FlatList
        data={listData}
        keyExtractor={(it) => it.key}
        getItemLayout={getItemLayout}
        initialNumToRender={30}
        maxToRenderPerBatch={24}
        windowSize={9}
        onEndReachedThreshold={1.2}
        onEndReached={loadMore}
        renderItem={({ item }) => {
          if (item.type === "year") {
            return (
              <View style={styles.yearHeader}>
                <Text style={styles.yearHeaderText}>{item.year}</Text>
              </View>
            );
          }
          return (
            <DayGridRow
              row={item.row}
              dayIndex={item.dayIndex}
              styles={styles}
              mode={mode}
              activities={activities}
              emptyColor={c.empty}
              hasNote={!!notes[item.row.key]}
              shownHour={shown?.date === item.row.key ? shown.hour : -1}
              onCell={onCell}
              onHoverIn={onHoverIn}
              onHoverOut={onHoverOut}
              onNote={onNote}
            />
          );
        }}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />

      {!selectMode && shown && (
        <DetailBar selected={shown} note={notes[shown.date]} hour24={config.hour24} />
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
            placeholder="e.g. travel, an event, something memorable…"
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


function DetailBar({ selected, note, hour24 }: { selected: { date: string; hour: number; entry?: LocalEntry }; note?: string; hour24: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const e = selected.entry;
  const [y, mo, d] = selected.date.split("-").map(Number);
  const dateLabel = `${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} ${mo}/${d}`;
  return (
    <View style={styles.detail}>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailTitle}>{dateLabel} · {hourRangeLabel(selected.hour, hour24)}</Text>
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
  // Single-cell Clear: stage AND persist immediately (clearing one or both fields,
  // including clear+clear, is a real edit - it shouldn't need anything else to save).
  function clearActivity() {
    if (bulk) { setAct(null); return; }
    setAct(null);
    onSave?.(null, typeof feel === "number" ? feel : null);
  }
  function clearFeeling() {
    if (bulk) { setFeel(null); return; }
    setFeel(null);
    onSave?.(typeof act === "number" ? act : null, null);
  }
  // "Done" commits the current selection (covers staged-but-unsaved states) and closes.
  function done() {
    if (!bulk) onSave?.(typeof act === "number" ? act : null, typeof feel === "number" ? feel : null);
    onClose();
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
            <TouchableOpacity style={[styles.neutralButton, act === null && styles.neutralButtonActive]} onPress={clearActivity}>
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
            <TouchableOpacity style={styles.feelingItem} onPress={clearFeeling}>
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
              // Single-cell: commit the current selection (covers clear+clear) and close.
              <TouchableOpacity style={styles.noteSave} onPress={done}>
                <Text style={styles.noteSaveText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 4, marginBottom: 10 },
  heading: { fontSize: 28, fontWeight: "800", color: c.text },
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
  yearHeader: { height: YEAR_H, alignItems: "center", justifyContent: "center" },
  yearHeaderText: { fontSize: 26, fontWeight: "800", color: c.text, letterSpacing: 1 },
  headerCell: { flex: 1, alignItems: "center" },
  headerText: { fontSize: 8, color: c.textFaint },
  dayRow: { flexDirection: "row", paddingHorizontal: 12, alignItems: "center", height: DAY_H },
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

});
