import React, { useEffect, useState } from "react";
import { Text, StyleSheet, Button, ScrollView, View, TouchableOpacity, Switch, ActivityIndicator, Alert, Modal } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { resetConfig, useConfig, type ThemePref } from "@/lib/config";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { ScreenContainer } from "@/components/ScreenContainer";
import { scheduleDailyReminder, scheduleTestNotification } from "@/lib/notification";
import { refreshHourlyReminder } from "@/lib/hourlyReminder";
import { logout, useAuth } from "@/lib/auth";
import { sync, useSyncStatus, type SyncStatus } from "@/lib/entries";
import { isHealthAvailable, openHealthSettings } from "@/lib/health";
import { exportYearPdf, exportYearCsv } from "@/lib/exportYear";
import { syncHealthSleep } from "@/lib/healthSync";
import { getActivities, activityColor } from "@/lib/activities";
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

  const [hcAvailable, setHcAvailable] = useState<boolean | null>(null);
  const [sleepBusy, setSleepBusy] = useState(false);
  const [sleepMsg, setSleepMsg] = useState<string | null>(null);
  const [sleepModal, setSleepModal] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exportYearN, setExportYearN] = useState(() => new Date().getFullYear());
  useEffect(() => { isHealthAvailable().then(setHcAvailable).catch(() => setHcAvailable(false)); }, []);

  function setReminderHour(next: number) {
    const hour = (next + 24) % 24;
    config.reminderHour = hour;
    scheduleDailyReminder(hour);
  }

  async function runSleepSync(): Promise<void> {
    setSleepBusy(true);
    setSleepMsg(null);
    const r = await syncHealthSleep(Date.now(), { prompt: true, fullHistory: true });
    setSleepBusy(false);
    if (r.ok) {
      setSleepMsg(r.filled > 0 ? `Filled ${r.filled} sleep hour${r.filled === 1 ? "" : "s"}.` : "No new sleep hours to fill.");
      return;
    }
    config.healthSleepEnabled = false;
    const detail = r.reason === "denied" ? "Sleep access wasn't granted." : (r.reason || "Couldn't read sleep data.");
    setSleepMsg(detail);
    // The in-app request can't always surface Health Connect's grant screen
    // (e.g. once dismissed); offer the system screen so access can be granted there.
    Alert.alert(
      "Sleep auto-fill",
      `${detail}\n\nOpen Health Connect to allow RightNow to read your sleep?`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Health Connect", onPress: () => { void openHealthSettings(); } },
      ],
    );
  }

  function toggleSleep(next: boolean) {
    setSleepMsg(null);
    if (!next) {
      config.healthSleepEnabled = false;
      return;
    }
    // Enable, then prove the Health Connect path works on this device before
    // leaving it on. runSleepSync() flips the flag back off on any failure, so a
    // refused/unavailable permission never leaves the feature half-enabled.
    config.healthSleepEnabled = true;
    void runSleepSync();
  }

  async function toggleHourly(next: boolean) {
    if (next) {
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Notifications are off", "Enable notifications for RightNow in your device settings to get the hourly check-in.");
        return;
      }
    }
    config.hourlyReminderEnabled = next;
    await refreshHourlyReminder();
  }

  return (
    <ScreenContainer>
    <SafeAreaView style={styles.container} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.scroll}>
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

      <Text style={styles.label}>Reminders</Text>
      <View style={styles.rowBetween}>
        <Text style={styles.itemLabel}>Daily reminder</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.stepper} onPress={() => setReminderHour(config.reminderHour - 1)}>
            <Text style={styles.stepperText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.reminderValue}>{formatHour(config.reminderHour, config.hour24)}</Text>
          <TouchableOpacity style={styles.stepper} onPress={() => setReminderHour(config.reminderHour + 1)}>
            <Text style={styles.stepperText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.sleepRow}>
        <Text style={styles.sleepDesc}>Hourly check-in — a nudge each hour to log the current hour, escalating until you catch up.</Text>
        <Switch
          value={config.hourlyReminderEnabled}
          onValueChange={(v) => { void toggleHourly(v); }}
          trackColor={{ true: c.primary, false: c.border }}
        />
      </View>
      {hcAvailable ? (
        <TouchableOpacity style={styles.navItem} onPress={() => setSleepModal(true)}>
          <Icon name="bedtime" style={{ color: c.textBody }} />
          <Text style={styles.navText}>Sleep auto-fill</Text>
          <Text style={styles.navStatus}>{config.healthSleepEnabled ? "On" : "Off"}</Text>
          <Icon name="chevron-right" style={{ color: c.textFaint }} />
        </TouchableOpacity>
      ) : null}

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
      <View style={[styles.sleepRow, { marginTop: 12 }]}>
        <Text style={styles.sleepDesc}>24-hour time</Text>
        <Switch
          value={config.hour24}
          onValueChange={(v) => { config.hour24 = v; }}
          trackColor={{ true: c.primary, false: c.border }}
        />
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
      <TouchableOpacity style={styles.navItem} onPress={() => { setExportYearN(new Date().getFullYear()); setExportModal(true); }}>
        <Icon name="file-download" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Export a year (PDF / CSV)</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/backup")}>
        <Icon name="backup" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Backup &amp; restore (all data)</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>

      <Text style={styles.label}>Account &amp; devices</Text>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/account")}>
        <Icon name="lock" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Email &amp; password backup</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push("/link")}>
        <Icon name="qr-code-2" style={{ color: c.textBody }} />
        <Text style={styles.navText}>Link a device</Text>
        <Icon name="chevron-right" style={{ color: c.textFaint }} />
      </TouchableOpacity>

      <View style={styles.spacer} />
      <View style={styles.account}>
        {email ? <Text style={styles.accountText}>Signed in as {email}</Text> : null}
        <Button title={"Log Out"} color={c.danger} onPress={() => { logout(); }} />
        <View style={styles.utilRow}>
          <Button title={"Test notification"} onPress={() => { scheduleTestNotification(); }} />
          <Button title={"Reset settings"} onPress={() => { resetConfig(); }} />
        </View>
      </View>

      <Modal visible={sleepModal} transparent animationType="fade" onRequestClose={() => setSleepModal(false)}>
        <View style={styles.sleepBackdrop}>
          <View style={styles.sleepCard}>
            <Text style={styles.sleepTitle}>Sleep auto-fill</Text>
            <View style={styles.sleepRow}>
              <Text style={styles.sleepDesc}>
                Mark unlogged hours as sleep from Health Connect. Never overwrites a manual entry.
              </Text>
              <Switch
                value={config.healthSleepEnabled}
                onValueChange={toggleSleep}
                trackColor={{ true: c.primary, false: c.border }}
              />
            </View>
            {config.healthSleepEnabled ? (
              <>
                <Text style={styles.sleepSub}>Which activity is sleep?</Text>
                <View style={styles.chipsWrap}>
                  {getActivities().map((a) => {
                    const active = a.index === config.sleepActivityIndex;
                    return (
                      <TouchableOpacity
                        key={a.index}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { config.sleepActivityIndex = a.index; setSleepMsg(null); }}
                      >
                        <View style={[styles.chipDot, { backgroundColor: activityColor(a.index) }]} />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{a.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.sleepActions}>
                  <TouchableOpacity
                    style={[styles.syncBtn, sleepBusy && styles.disabled]}
                    disabled={sleepBusy}
                    onPress={() => { void runSleepSync(); }}
                  >
                    <Text style={styles.syncBtnText}>Sync sleep now</Text>
                  </TouchableOpacity>
                  {sleepBusy ? <ActivityIndicator color={c.primary} /> : null}
                </View>
                {sleepMsg ? <Text style={styles.sleepMsg}>{sleepMsg}</Text> : null}
              </>
            ) : null}
            <TouchableOpacity style={styles.sleepDone} onPress={() => setSleepModal(false)}>
              <Text style={styles.sleepDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={exportModal} transparent animationType="fade" onRequestClose={() => setExportModal(false)}>
        <View style={styles.sleepBackdrop}>
          <View style={styles.sleepCard}>
            <Text style={styles.sleepTitle}>Export a year</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.itemLabel}>Year</Text>
              <View style={styles.row}>
                <TouchableOpacity style={styles.stepper} onPress={() => setExportYearN((y) => y - 1)}>
                  <Text style={styles.stepperText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.reminderValue}>{exportYearN}</Text>
                <TouchableOpacity style={styles.stepper} onPress={() => setExportYearN((y) => Math.min(new Date().getFullYear(), y + 1))}>
                  <Text style={styles.stepperText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.sleepSub}>PDF has activities (page 1) and feelings (page 2). CSV is one metric and re-imports cleanly.</Text>
            <View style={styles.exportBtns}>
              <TouchableOpacity style={styles.syncBtn} onPress={() => { void exportYearPdf(exportYearN); }}>
                <Text style={styles.syncBtnText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.syncBtn} onPress={() => { void exportYearCsv(exportYearN, "activity"); }}>
                <Text style={styles.syncBtnText}>CSV · activities</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.syncBtn} onPress={() => { void exportYearCsv(exportYearN, "feeling"); }}>
                <Text style={styles.syncBtnText}>CSV · feelings</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.sleepDone} onPress={() => setExportModal(false)}>
              <Text style={styles.sleepDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 16, paddingBottom: 40 },
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
  sleepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sleepDesc: { flex: 1, fontSize: 13, color: c.textBody, lineHeight: 18 },
  sleepSub: { fontSize: 14, fontWeight: "600", color: c.textBody, marginTop: 14, marginBottom: 8 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  chipActive: { borderColor: c.primary, backgroundColor: c.surface },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: 13, color: c.textBody },
  chipTextActive: { color: c.text, fontWeight: "700" },
  sleepActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  sleepMsg: { fontSize: 13, color: c.textMuted, marginTop: 10 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
  navText: { flex: 1, fontSize: 16, color: c.text },
  navStatus: { fontSize: 14, color: c.textMuted },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemLabel: { fontSize: 16, color: c.text },
  utilRow: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 14, flexWrap: "wrap" },
  exportBtns: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  sleepBackdrop: { flex: 1, backgroundColor: c.backdrop, justifyContent: "center", padding: 24 },
  sleepCard: { backgroundColor: c.card, borderRadius: 14, padding: 20 },
  sleepTitle: { fontSize: 20, fontWeight: "800", color: c.text, marginBottom: 12 },
  sleepDone: { marginTop: 18, alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8, backgroundColor: c.primary },
  sleepDoneText: { color: c.onPrimary, fontWeight: "700", fontSize: 15 },
  spacer: { height: 28 },
  account: { marginTop: 28, paddingTop: 24, borderTopWidth: 1, borderTopColor: c.cardBorder },
  accountText: { fontSize: 14, color: c.textMuted, marginBottom: 8 },
});
