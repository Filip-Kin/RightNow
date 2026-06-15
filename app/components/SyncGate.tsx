// Full-screen blocker shown after device setup until the first sync finishes. The
// (tabs) layout renders this instead of the tab navigator while
// config.initialSyncDone is false, so no main UI shows until the data is down.
// entries.sync() flips initialSyncDone on success, which re-renders the layout away
// from this gate. Offline/error gets an escape hatch so a first launch can't brick.
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSyncStatus, sync, useSyncProgress, useSyncStatus } from "@/lib/entries";
import { useConfig } from "@/lib/config";
import { SyncBar } from "@/components/SyncBar";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export function SyncGate() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const config = useConfig();
  const progress = useSyncProgress();
  const { status } = useSyncStatus();

  // Kick a sync if one isn't already running (e.g. relaunched mid-first-sync).
  useEffect(() => {
    if (getSyncStatus().status !== "syncing") void sync().catch(() => {});
  }, []);

  const failed = status === "offline" || status === "error";
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.center}>
        {failed ? (
          <>
            <Text style={styles.title}>Couldn't reach the server</Text>
            <Text style={styles.subtitle}>
              {status === "offline"
                ? "You appear to be offline. Connect and try again, or continue offline and sync later."
                : "Something went wrong syncing your data. Try again, or continue offline and sync later."}
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => void sync().catch(() => {})}>
              <Text style={styles.btnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => { config.initialSyncDone = true; }}>
              <Text style={styles.linkText}>Use offline</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Getting your data ready…</Text>
            <Text style={styles.subtitle}>This only happens once on this device. Hang tight.</Text>
            {progress && progress.total > 0 ? (
              <>
                <Text style={styles.count}>{progress.done.toLocaleString()} / {progress.total.toLocaleString()}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%` }]} />
                </View>
              </>
            ) : (
              <ActivityIndicator color={c.primary} style={{ marginTop: 24 }} />
            )}
            <View style={{ height: 24 }} />
            <SyncBar />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8, alignSelf: "stretch" },
  title: { fontSize: 22, fontWeight: "800", color: c.text, textAlign: "center" },
  subtitle: { fontSize: 14, color: c.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 12 },
  count: { fontSize: 14, color: c.textMuted, marginBottom: 12 },
  track: { width: "80%", maxWidth: 360, height: 10, borderRadius: 5, backgroundColor: c.track, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: c.primary, borderRadius: 5 },
  btn: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, marginTop: 12, alignSelf: "stretch", alignItems: "center" },
  btnText: { color: c.onPrimary, fontWeight: "800", fontSize: 16 },
  linkBtn: { paddingVertical: 14 },
  linkText: { color: c.textMuted, fontSize: 14, fontWeight: "600" },
});
