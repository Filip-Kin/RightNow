// Blocking gate shown when the server has rejected our session token (see
// auth.markSessionExpired). The app is NOT reachable from here: the user must sign
// in again. Their local data is still on-device, so we offer a backup export first
// in case they can't get back into this account.
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { getAllEntries, getNotes, loadStore } from "@/lib/entries";
import { getActivities } from "@/lib/activities";
import { serializeBackup, backupFilename } from "@/lib/backup";
import { saveExport } from "@/lib/share";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export default function SessionExpiredScreen() {
  const c = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportBackup() {
    setError(null); setMsg(null); setBusy(true);
    try {
      await loadStore(); // ensure the decrypted store is hydrated before reading it
      const iso = new Date().toISOString();
      const json = serializeBackup(getActivities(), getAllEntries(), getNotes(), iso);
      await saveExport(backupFilename(iso), "application/json", json);
      setMsg("Backup exported. Keep it somewhere safe before signing in again.");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer maxWidth={640}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Your session ended</Text>
          <Text style={styles.body}>
            You've been signed out and need to sign in again to keep using RightNow. Your data is safe and
            still encrypted on the server. If you want a local copy first, export a backup before you sign in.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace("/auth/login")} disabled={busy}>
            <Text style={styles.primaryText}>Sign in again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.outlineBtn, busy && styles.disabled]} onPress={exportBackup} disabled={busy}>
            {busy ? <ActivityIndicator color={c.primary} /> : <Text style={styles.outlineText}>Export my data first</Text>}
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
  content: { padding: 24, flexGrow: 1, justifyContent: "center" },
  title: { color: c.text, fontSize: 24, fontWeight: "800", marginBottom: 12 },
  body: { color: c.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  primaryBtn: { backgroundColor: c.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: "700" },
  outlineBtn: { borderWidth: 1, borderColor: c.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 12 },
  outlineText: { color: c.primary, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  errorText: { color: c.danger, marginTop: 16, fontSize: 14 },
  resultBox: { marginTop: 16, padding: 14, backgroundColor: c.successSoft, borderRadius: 8 },
  resultText: { color: c.successText, fontSize: 15, fontWeight: "600" },
});
