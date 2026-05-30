// Full account backup: export everything (taxonomy + all entries + all notes) to a
// single JSON file, and restore it (e.g. to migrate to a new account). Distinct
// from "Import data (CSV)", which is the per-year WAYDRN spreadsheet migrator.
import React, { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { File as FsFile } from "expo-file-system";
import { ScreenContainer } from "@/components/ScreenContainer";
import { getAllEntries, getNotes, importEntries, importNotes, loadStore, useEntries, useNotes } from "@/lib/entries";
import { getActivities, setActivities, useActivities } from "@/lib/activities";
import { serializeBackup, parseBackup, backupFilename } from "@/lib/backup";
import { saveExport } from "@/lib/share";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    const f = (asset as unknown as { file?: File }).file;
    if (f) return await f.text();
    return await (await fetch(asset.uri)).text();
  }
  return await new FsFile(asset.uri).text();
}

export default function BackupScreen() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  // These hooks also trigger loadStore(), so the counts below reflect what an
  // export would actually contain on THIS device.
  const entries = useEntries();
  const notes = useNotes();
  const activities = useActivities();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noteCount = Object.keys(notes).length;

  async function exportBackup() {
    setError(null); setMsg(null);
    try {
      await loadStore(); // make sure the local store is hydrated before reading it
      const iso = new Date().toISOString();
      const json = serializeBackup(getActivities(), getAllEntries(), getNotes(), iso);
      await saveExport(backupFilename(iso), "application/json", json);
      const entries = getAllEntries().length;
      setMsg(`Exported ${entries} entr${entries === 1 ? "y" : "ies"}, ${getActivities().length} activities, and your notes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  }

  async function restoreBackup() {
    setError(null); setMsg(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "*/*"], copyToCacheDirectory: true });
      if (res.canceled) return;
      setBusy(true);
      const text = await readPickedFile(res.assets[0]);
      const parsed = parseBackup(text);
      if (parsed.activities.length) setActivities(parsed.activities);
      const n = await importEntries(parsed.entries);
      const m = await importNotes(parsed.notes);
      setMsg(`Restored ${n} entr${n === 1 ? "y" : "ies"}, ${parsed.activities.length} activities${m ? `, ${m} note${m === 1 ? "" : "s"}` : ""}. Syncing to your account…`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer maxWidth={720}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.hint}>
            A full backup is one JSON file with everything: your activities, every logged hour across all
            years, and all day notes. Use it to keep an off-platform copy or to move your data to another
            account. This is separate from "Import data (CSV)", which is for the old WAYDRN spreadsheets.
          </Text>

          <View style={styles.countBox}>
            <Text style={styles.countText}>On this device</Text>
            <Text style={styles.countBig}>{entries.length} hours · {noteCount} notes · {activities.length} activities</Text>
            {entries.length === 0 && (
              <Text style={styles.countWarn}>
                No data here yet. Export from the device that actually holds your history (e.g. the browser
                you imported on), not a fresh install.
              </Text>
            )}
          </View>

          <Text style={styles.label}>Back up</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={exportBackup} disabled={busy}>
            <Text style={styles.primaryText}>Export all data</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Restore</Text>
          <Text style={styles.hint}>
            Imports a backup file into the account you're signed in to now, merging with anything already
            here (newest wins). Your activities are replaced with the backup's.
          </Text>
          <TouchableOpacity style={[styles.outlineBtn, busy && styles.disabled]} onPress={restoreBackup} disabled={busy}>
            {busy ? <ActivityIndicator color={c.primary} /> : <Text style={styles.outlineText}>Restore from backup</Text>}
          </TouchableOpacity>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {msg && <View style={styles.resultBox}><Text style={styles.resultText}>{msg}</Text></View>}
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  hint: { color: c.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  countBox: { backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 4 },
  countText: { color: c.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  countBig: { color: c.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  countWarn: { color: c.danger, fontSize: 13, marginTop: 8, lineHeight: 18 },
  label: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8, color: c.textBody },
  primaryBtn: { backgroundColor: c.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: "700" },
  outlineBtn: { borderWidth: 1, borderColor: c.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  outlineText: { color: c.primary, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  errorText: { color: c.danger, marginTop: 14, fontSize: 14 },
  resultBox: { marginTop: 16, padding: 14, backgroundColor: c.successSoft, borderRadius: 8 },
  resultText: { color: c.successText, fontSize: 15, fontWeight: "600" },
});
