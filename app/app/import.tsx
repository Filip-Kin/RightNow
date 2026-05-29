// Import historical WAYDRN/HAYFRN data from a CSV export. One metric (activity or
// feeling) per file. For activity files we surface the file's legend and let the
// user resolve how each source index maps onto their current activities (reuse an
// existing one, or create a new activity for it). Writes merge with existing cells
// and use each hour's real time as the clock, so a later manual edit always wins.
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { File as FsFile } from "expo-file-system";
import { Icon } from "@/components/Icon";
import { importEntries } from "@/lib/entries";
import { parseWaydrnCsv, inferYearFromName, type ParsedCsv } from "@/lib/csv";
import {
  COLOR_CHOICES, getActivity, getContrastingTextColor, ICON_CHOICES,
  upsertActivity, useActivities,
} from "@/lib/activities";

type Metric = "activity" | "feeling";
// For each source index: the existing activity index to map onto, or "create".
type Choice = number | "create";

async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    // expo-document-picker (web) attaches the DOM File; fall back to fetching the blob URI.
    const f = (asset as unknown as { file?: File }).file;
    if (f) return await f.text();
    return await (await fetch(asset.uri)).text();
  }
  return await new FsFile(asset.uri).text();
}

export default function ImportScreen() {
  const activities = useActivities();
  const [metric, setMetric] = useState<Metric>("activity");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function pickFile() {
    setError(null);
    setResult(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "*/*"], copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      const inferred = inferYearFromName(asset.name);
      const useYear = inferred ?? Number(year);
      if (inferred) setYear(String(inferred));
      const text = await readPickedFile(asset);
      const p = parseWaydrnCsv(text, useYear);
      // Default each source index: reuse the activity already at that index, else create.
      const defaults: Record<number, Choice> = {};
      for (const v of p.values) defaults[v] = getActivity(v) ? v : "create";
      setFileName(asset.name);
      setParsed(p);
      setChoices(defaults);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  function reset() {
    setParsed(null);
    setFileName(null);
    setChoices({});
    setError(null);
    setResult(null);
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      let items: { date: string; hour: number; activity?: number | null; feeling?: number | null }[];
      if (metric === "feeling") {
        items = parsed.cells
          .filter((c) => c.value >= 0 && c.value <= 5)
          .map((c) => ({ date: c.date, hour: c.hour, feeling: c.value }));
      } else {
        // Resolve each source index to a stored activity index, creating new ones as chosen.
        const remap = new Map<number, number>();
        const used = new Set(activities.map((a) => a.index));
        for (const src of parsed.values) {
          const choice = choices[src] ?? (getActivity(src) ? src : "create");
          if (choice === "create") {
            const name = parsed.legend.get(src) ?? `Activity ${src}`;
            const idx = used.has(src) ? nextFreeIndexExcluding(used) : src;
            used.add(idx);
            upsertActivity({ index: idx, name, color: COLOR_CHOICES[idx % COLOR_CHOICES.length], icon: ICON_CHOICES[idx % ICON_CHOICES.length] });
            remap.set(src, idx);
          } else {
            remap.set(src, choice);
          }
        }
        items = parsed.cells
          .filter((c) => remap.has(c.value))
          .map((c) => ({ date: c.date, hour: c.hour, activity: remap.get(c.value)! }));
      }
      const n = await importEntries(items);
      setResult(`Imported ${n} ${metric} entr${n === 1 ? "y" : "ies"} across ${parsed.dayCount} day${parsed.dayCount === 1 ? "" : "s"}.`);
      setParsed(null);
      setFileName(null);
      setChoices({});
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.hint}>
          Import a WAYDRN (activity) or HAYFRN (feeling) CSV. Each row is a day, columns are hours.
          Import one file per metric.
        </Text>

        <Text style={styles.label}>This file is</Text>
        <View style={styles.segment}>
          {(["activity", "feeling"] as Metric[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segmentItem, metric === m && styles.segmentItemActive]}
              onPress={() => setMetric(m)}
              disabled={!!parsed}
            >
              <Text style={[styles.segmentText, metric === m && styles.segmentTextActive]}>
                {m === "activity" ? "Activity" : "Feeling"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Year</Text>
        <TextInput
          style={styles.input}
          value={year}
          onChangeText={(t) => setYear(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          editable={!parsed}
        />

        {!parsed && (
          <TouchableOpacity style={styles.primaryBtn} onPress={pickFile}>
            <Icon name="upload-file" style={{ color: "#fff" }} />
            <Text style={styles.primaryText}>Choose CSV file</Text>
          </TouchableOpacity>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        )}

        {parsed && (
          <>
            <Text style={styles.summary}>
              {fileName} — {parsed.cells.length} cells, {parsed.dayCount} days, values {parsed.values.join(", ")}
            </Text>

            {metric === "activity" && (
              <>
                <Text style={styles.label}>Map activities</Text>
                <Text style={styles.hint}>
                  Each number in the file maps to one of your activities. Where the file's label differs
                  from the activity currently at that index, pick what you want.
                </Text>
                {parsed.values.map((src) => {
                  const srcName = parsed.legend.get(src) ?? `#${src}`;
                  const current = getActivity(src);
                  const conflict = current && current.name.toLowerCase() !== srcName.toLowerCase();
                  return (
                    <View key={src} style={styles.mapRow}>
                      <View style={styles.mapHeader}>
                        <Text style={styles.mapSource}>#{src} · {srcName}</Text>
                        {conflict && <Text style={styles.conflictTag}>#{src} is "{current!.name}" now</Text>}
                      </View>
                      <View style={styles.chipWrap}>
                        {activities.map((a) => (
                          <TouchableOpacity
                            key={a.index}
                            style={[styles.chip, { borderColor: a.color }, choices[src] === a.index && { backgroundColor: a.color }]}
                            onPress={() => setChoices((c) => ({ ...c, [src]: a.index }))}
                          >
                            <Text style={[styles.chipText, choices[src] === a.index && { color: getContrastingTextColor(a.color) }]}>
                              {a.name} #{a.index}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={[styles.chip, styles.createChip, choices[src] === "create" && styles.createChipActive]}
                          onPress={() => setChoices((c) => ({ ...c, [src]: "create" }))}
                        >
                          <Text style={[styles.chipText, choices[src] === "create" && { color: "#fff" }]}>
                            ＋ New "{srcName}"
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {metric === "feeling" && (
              <Text style={styles.hint}>Feeling values (0–5) import directly. Out-of-range cells are skipped.</Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={reset} disabled={busy}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, styles.importBtn, busy && styles.disabled]} onPress={runImport} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Import</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function nextFreeIndexExcluding(used: Set<number>): number {
  let i = 0;
  while (used.has(i)) i++;
  // Stay clear of the live store's indices too (covers concurrent edits).
  while (getActivity(i)) i++;
  return i;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  hint: { color: "#5f6368", fontSize: 13, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8, color: "#3c4043" },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: "#dadce0", borderRadius: 8, overflow: "hidden" },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: "#fff" },
  segmentItemActive: { backgroundColor: "#1a73e8" },
  segmentText: { fontSize: 15, fontWeight: "600", color: "#3c4043" },
  segmentTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#dadce0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#111" },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: "#1a73e8", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 20 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorText: { color: "#d93025", marginTop: 14, fontSize: 14 },
  resultBox: { marginTop: 16, padding: 14, backgroundColor: "#e6f4ea", borderRadius: 8 },
  resultText: { color: "#137333", fontSize: 15, fontWeight: "600" },
  summary: { marginTop: 16, color: "#3c4043", fontSize: 13, fontStyle: "italic" },
  mapRow: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  mapHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  mapSource: { fontSize: 15, fontWeight: "700", color: "#111" },
  conflictTag: { fontSize: 12, color: "#b06000", backgroundColor: "#fef7e0", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: "#3c4043", fontWeight: "500" },
  createChip: { borderColor: "#1a73e8", borderStyle: "dashed" },
  createChipActive: { backgroundColor: "#1a73e8" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 24 },
  importBtn: { marginTop: 0, minWidth: 110 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16, justifyContent: "center" },
  cancelText: { color: "#5f6368", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
});
