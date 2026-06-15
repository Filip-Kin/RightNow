// Shared "sync status" row: a spinner (or a green check when done) plus a label.
// Used on the setup permission step, in Settings, and on the initial-sync gate so
// they all look identical and read from one source (the sync store in entries.ts).
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSyncProgress, useSyncStatus } from "@/lib/entries";
import { Icon } from "@/components/Icon";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

export function syncLabelFor(
  progress: { done: number; total: number; phase: "push" | "pull" } | null,
  synced: boolean,
): string {
  if (synced) return "Your data is ready";
  if (progress && progress.total > 0) {
    const verb = progress.phase === "push" ? "Uploading" : "Downloading";
    return `${verb} your data… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`;
  }
  return "Syncing your data…";
}

export function SyncBar() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const progress = useSyncProgress();
  const { status } = useSyncStatus();
  const synced = status === "ok" && !progress;

  return (
    <View style={styles.bar}>
      {synced
        ? <Icon name="check-circle" style={{ color: c.successText }} size={22} />
        : <ActivityIndicator color={c.primary} />}
      <Text style={styles.text} numberOfLines={2}>{syncLabelFor(progress, synced)}</Text>
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 10, padding: 14 },
  text: { flex: 1, fontSize: 13, color: c.textBody },
});
