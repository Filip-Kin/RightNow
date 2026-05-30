import React from "react";
import { Text, StyleSheet, Button, View, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { resetConfig, useConfig, type ThemePref } from "@/lib/config";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { ScreenContainer } from "@/components/ScreenContainer";
import { scheduleDailyReminder, scheduleTestNotification } from "@/lib/notification";
import { logout, useAuth } from "@/lib/auth";
import { sync, useSyncStatus, type SyncStatus } from "@/lib/entries";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

function syncText(s: SyncStatus, lastSyncAt: number): string {
  switch (s) {
    case "syncing": return "Syncing…";
    case "ok": return lastSyncAt ? `Synced at ${new Date(lastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Synced";
    case "offline": return "Offline — will retry when you're back online";
    case "error": return "Not syncing — your session may be invalid. Sign in again.";
    default: return "Not synced yet";
  }
}

const THEME_OPTIONS: { key: ThemePref; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

function formatHour(hour: number, hour24: boolean): string {
  if (hour24) return `${hour.toString().padStart(2, "0")}:00`;
  const h = hour % 12 || 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export default function Settings() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const config = useConfig();
  const { email } = useAuth();
  const syncState = useSyncStatus();
  const router = useRouter();

  function setReminderHour(next: number) {
    const hour = (next + 24) % 24;
    config.reminderHour = hour;
    scheduleDailyReminder(hour);
  }

  return (
    <ScreenContainer>
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.syncBar}>
        <View style={styles.syncDot}>
          <View style={[styles.dot, { backgroundColor: syncState.status === "ok" ? c.successText : syncState.status === "error" ? c.danger : c.textFaint }]} />
        </View>
        <Text style={styles.syncText} numberOfLines={2}>{syncText(syncState.status, syncState.lastSyncAt)}</Text>
        <TouchableOpacity
          style={[styles.syncBtn, syncState.status === "syncing" && styles.disabled]}
          disabled={syncState.status === "syncing"}
          onPress={() => { sync(); }}
        >
          <Text style={styles.syncBtnText}>Sync now</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Appearance</Text>
      <View style={styles.segment}>
        {THEME_OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.key}
            style={[styles.segItem, config.theme === o.key && styles.segItemActive]}
            onPress={() => { config.theme = o.key; }}
          >
            <Text style={[styles.segText, config.theme === o.key && styles.segTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Time Format</Text>
      <Button
        title={config.hour24 ? "24 Hour" : "12 Hour"}
        onPress={() => {
          config.hour24 = !config.hour24;
        }}
      />

      <Text style={styles.label}>Daily Reminder</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.stepper} onPress={() => setReminderHour(config.reminderHour - 1)}>
          <Text style={styles.stepperText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.reminderValue}>{formatHour(config.reminderHour, config.hour24)}</Text>
        <TouchableOpacity style={styles.stepper} onPress={() => setReminderHour(config.reminderHour + 1)}>
          <Text style={styles.stepperText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Data</Text>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/activities")}>
        <Icon name="category" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Edit activities</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/import")}>
        <Icon name="upload-file" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Import data (CSV)</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/backup")}>
        <Icon name="backup" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Backup &amp; restore (all data)</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/link")}>
        <Icon name="qr-code-2" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Link a device</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/account")}>
        <Icon name="lock" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Email &amp; password backup</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>

      <View style={styles.spacer} />
      <Button title={"Send Test Notification"} onPress={() => { scheduleTestNotification(); }} />
      <Button title={"Reset Settings"} onPress={() => { resetConfig(); }} />

      <View style={styles.account}>
        {email ? <Text style={styles.accountText}>Signed in as {email}</Text> : null}
        <Button title={"Log Out"} color={c.danger} onPress={() => { logout(); }} />
      </View>
    </SafeAreaView>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: c.bg },
  heading: { fontSize: 28, fontWeight: "800", marginBottom: 16, color: c.text },
  syncBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface, borderRadius: 10, padding: 12 },
  syncDot: { width: 14, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  syncText: { flex: 1, fontSize: 13, color: c.textBody, lineHeight: 17 },
  syncBtn: { borderWidth: 1, borderColor: c.primary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  syncBtnText: { color: c.primary, fontWeight: "700", fontSize: 13 },
  disabled: { opacity: 0.5 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" },
  segItem: { paddingVertical: 8, paddingHorizontal: 18, backgroundColor: c.card },
  segItemActive: { backgroundColor: c.primary },
  segText: { fontSize: 14, fontWeight: "600", color: c.textBody },
  segTextActive: { color: c.onPrimary },
  label: { fontSize: 16, fontWeight: "bold", marginTop: 20, marginBottom: 8, color: c.textBody },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepper: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  stepperText: { color: c.onPrimary, fontSize: 24, fontWeight: "700", lineHeight: 26 },
  reminderValue: { fontSize: 18, fontWeight: "600", color: c.text, minWidth: 90, textAlign: "center" },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
  navText: { flex: 1, fontSize: 16, color: c.text },
  spacer: { height: 28 },
  account: { marginTop: "auto", paddingTop: 24 },
  accountText: { fontSize: 14, color: c.textMuted, marginBottom: 8 },
});
