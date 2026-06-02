// One-time "set up this device" flow shown right after sign-in. Two steps:
//   1. Permissions - notifications, battery-optimization exemption (so Doze doesn't
//      delay the hourly nudge), the draw-over quick-log popup, and Health Connect
//      sleep access - while the first data sync runs in the background.
//   2. Preferences - reminder cadence (off/daily/hourly) + time format.
// Every permission is skippable and can be redone from Settings. Gated by
// config.deviceSetupDone.
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { sync } from "@/lib/entries";
import { requestNotificationPermissionsAsync } from "@/lib/notification";
import { refreshHourlyReminder, canDrawOverlay, requestOverlayPermission } from "@/lib/hourlyReminder";
import { requestIgnoreBatteryOptimizations } from "@/lib/battery";
import { isHealthAvailable } from "@/lib/health";
import { syncHealthSleep } from "@/lib/healthSync";
import { applyReminderMode, getReminderMode, type ReminderMode } from "@/lib/reminderMode";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

type StepState = "idle" | "busy" | "done";

export default function SetupScreen() {
  const { status } = useAuth();
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const config = useConfig();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [synced, setSynced] = useState(false);
  const [notif, setNotif] = useState<StepState>("idle");
  const [battery, setBattery] = useState<StepState>("idle");
  const [overlay, setOverlay] = useState<StepState>("idle");
  const [health, setHealth] = useState<StepState>("idle");
  const [hcAvailable, setHcAvailable] = useState(false);
  const [mode, setMode] = useState<ReminderMode>(getReminderMode());

  // Kick off the first sync immediately; the user does the permission steps while
  // it downloads in the background.
  useEffect(() => {
    sync((done, total) => setProgress({ done, total }))
      .catch(() => {})
      .finally(() => { setProgress(null); setSynced(true); });
    isHealthAvailable().then(setHcAvailable).catch(() => setHcAvailable(false));
  }, []);

  // Re-check the grantable permissions on mount AND whenever the app returns to the
  // foreground - so a permission the user toggled on a system settings screen flips
  // its row to the green checkmark when they come back. (Battery optimization can't
  // be read back without a native module, so it stays as last set.)
  useEffect(() => {
    const recheck = () => {
      Notifications.getPermissionsAsync().then((p) => setNotif(p.granted ? "done" : "idle")).catch(() => {});
      canDrawOverlay().then((ok) => setOverlay(ok ? "done" : "idle")).catch(() => {});
    };
    recheck();
    const subscription = AppState.addEventListener("change", (s) => { if (s === "active") recheck(); });
    return () => subscription.remove();
  }, []);

  if (status === "loading") return null;
  if (status === "unauthenticated") return <Redirect href="/auth/login" />;

  async function doNotif() {
    setNotif("busy");
    const r = await requestNotificationPermissionsAsync();
    setNotif(r.granted ? "done" : "idle");
  }
  async function doBattery() {
    // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is a one-tap system dialog (Allow),
    // not a settings screen. We can't read the result back, so mark it done.
    setBattery("busy");
    await requestIgnoreBatteryOptimizations(Application.applicationId ?? "com.filipkin.rightnow");
    setBattery("done");
  }
  function doOverlay() {
    // The overlay grant lives on a system settings list (no one-tap dialog), so walk
    // the user through it, then re-check on return (the AppState listener above).
    Alert.alert(
      "Allow the quick-log popup",
      "This opens Android settings. Find RightNow in the list, turn on “Allow display over other apps”, then press Back to return here – the check will update automatically.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open settings", onPress: () => { setOverlay("busy"); void requestOverlayPermission(); } },
      ],
    );
  }
  async function doHealth() {
    setHealth("busy");
    config.healthSleepEnabled = true;
    const r = await syncHealthSleep(Date.now(), { prompt: true, fullHistory: true });
    if (r.ok) setHealth("done");
    else { config.healthSleepEnabled = false; setHealth("idle"); }
  }
  async function chooseMode(m: ReminderMode) {
    setMode(m); // optimistic
    const ok = await applyReminderMode(m);
    if (!ok) setMode(getReminderMode()); // bailed (e.g. notifications denied) - revert
  }
  function finish() {
    config.deviceSetupDone = true;
    refreshHourlyReminder();
    router.replace("/");
  }

  const syncLabel = synced
    ? "Your data is ready"
    : progress && progress.total > 0
      ? `Downloading your data… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
      : "Syncing your data…";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Set up RightNow</Text>

        {step === 1 ? (
          <>
            <Text style={styles.subtitle}>A few quick permissions so reminders and sleep auto-fill work. You can skip any of these and change them later in Settings.</Text>

            <View style={styles.syncBar}>
              {synced ? <Icon name="check-circle" style={{ color: c.successText }} size={22} /> : <ActivityIndicator color={c.primary} />}
              <Text style={styles.syncText} numberOfLines={2}>{syncLabel}</Text>
            </View>

            <Step
              styles={styles} c={c}
              icon="notifications" title="Notifications"
              desc="Daily and hourly reminders to log how you're doing."
              state={notif} onPress={doNotif} cta="Allow"
            />
            {Platform.OS === "android" ? (
              <Step
                styles={styles} c={c}
                icon="battery-saver" title="Run in the background"
                desc="Exempt RightNow from battery optimization so hourly reminders fire on time."
                state={battery} onPress={doBattery} cta="Allow"
              />
            ) : null}
            {Platform.OS === "android" ? (
              <Step
                styles={styles} c={c}
                icon="layers" title="Quick-log popup"
                desc="Let the hourly check-in pop up over other apps so you can log without switching away."
                state={overlay} onPress={doOverlay} cta="Allow"
              />
            ) : null}
            {hcAvailable ? (
              <Step
                styles={styles} c={c}
                icon="bedtime" title="Sleep auto-fill"
                desc="Let RightNow fill your sleeping hours from Health Connect."
                state={health} onPress={doHealth} cta="Enable & grant"
              />
            ) : null}

            <View style={styles.spacer} />
            <TouchableOpacity style={styles.finishBtn} onPress={() => setStep(2)}>
              <Text style={styles.finishText}>Continue</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>How often should RightNow nudge you, and how do you want times shown? You can change both anytime in Settings.</Text>

            <Text style={styles.sectionLabel}>Reminders</Text>
            <View style={styles.segment}>
              {([
                { value: "off", label: "Off" },
                { value: "daily", label: "Daily" },
                { value: "hourly", label: "Hourly" },
              ] as const).map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.segItem, mode === o.value && styles.segItemActive]}
                  onPress={() => { void chooseMode(o.value); }}
                >
                  <Text style={[styles.segText, mode === o.value && styles.segTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.segHint}>
              {mode === "hourly"
                ? "An hourly quick-log popup over whatever you're doing."
                : mode === "daily"
                  ? "One reminder a day to fill in your hours."
                  : "No reminders – log whenever you like."}
            </Text>

            <Text style={styles.sectionLabel}>Time format</Text>
            <View style={styles.segment}>
              {[
                { value: false, label: "12-hour" },
                { value: true, label: "24-hour" },
              ].map((o) => (
                <TouchableOpacity
                  key={o.label}
                  style={[styles.segItem, config.hour24 === o.value && styles.segItemActive]}
                  onPress={() => { config.hour24 = o.value; }}
                >
                  <Text style={[styles.segText, config.hour24 === o.value && styles.segTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.spacer} />
            <TouchableOpacity style={styles.finishBtn} onPress={finish}>
              <Text style={styles.finishText}>{synced ? "Done" : "Done (syncing in background)"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skip} onPress={() => setStep(1)}>
              <Text style={styles.skipText}>Back</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({
  styles, c, icon, title, desc, state, onPress, cta,
}: {
  styles: ReturnType<typeof makeStyles>;
  c: Colors;
  icon: IconName;
  title: string;
  desc: string;
  state: StepState;
  onPress: () => void;
  cta: string;
}) {
  const done = state === "done";
  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <Icon name={icon} style={{ color: done ? c.successText : c.textBody }} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{desc}</Text>
      </View>
      {done ? (
        <Icon name="check-circle" style={{ color: c.successText }} />
      ) : (
        <TouchableOpacity style={styles.cardBtn} disabled={state === "busy"} onPress={onPress}>
          {state === "busy" ? <ActivityIndicator color={c.onPrimary} /> : <Text style={styles.cardBtnText}>{cta}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "800", color: c.text, marginTop: 8 },
  subtitle: { fontSize: 14, color: c.textMuted, marginTop: 8, marginBottom: 18, lineHeight: 20 },
  syncBar: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 18 },
  syncText: { flex: 1, fontSize: 13, color: c.textBody },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: c.cardBorder },
  cardDone: { borderColor: c.successText },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.text },
  cardDesc: { fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 },
  cardBtn: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, minWidth: 96, alignItems: "center" },
  cardBtnText: { color: c.onPrimary, fontWeight: "700", fontSize: 13 },
  sectionLabel: { fontSize: 16, fontWeight: "bold", color: c.textBody, marginTop: 8, marginBottom: 10 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" },
  segItem: { paddingVertical: 10, paddingHorizontal: 22 },
  segItemActive: { backgroundColor: c.primary },
  segText: { color: c.textBody, fontWeight: "600", fontSize: 14 },
  segTextActive: { color: c.onPrimary },
  segHint: { color: c.textMuted, fontSize: 13, marginTop: 8, marginBottom: 4, lineHeight: 18 },
  spacer: { height: 16 },
  finishBtn: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  finishText: { color: c.onPrimary, fontWeight: "800", fontSize: 16 },
  skip: { alignItems: "center", paddingVertical: 14 },
  skipText: { color: c.textMuted, fontSize: 14 },
});
