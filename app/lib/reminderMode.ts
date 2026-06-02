// Shared reminder-mode setter used by both Settings and the first-run setup wizard,
// so the two stay in sync. Off/Daily/Hourly toggles the config flags, ensures the
// needed permissions, and (re)schedules the daily alarm / hourly native nudge.
import { Alert } from "react-native";
import * as Notifications from "expo-notifications";
import { getConfig } from "./config";
import { scheduleDailyReminder, cancelDailyReminder } from "./notification";
import { refreshHourlyReminder, canDrawOverlay, requestOverlayPermission } from "./hourlyReminder";

export type ReminderMode = "off" | "daily" | "hourly";

export function getReminderMode(): ReminderMode {
  const c = getConfig();
  return c?.hourlyReminderEnabled ? "hourly" : c?.dailyReminderEnabled ? "daily" : "off";
}

/**
 * Apply a reminder mode. For non-off modes it first ensures notification permission
 * (prompting once), bailing with an alert if denied. Hourly also nudges the user to
 * grant the draw-over-other-apps permission (the quick-log popup needs it). Returns
 * false if it bailed before changing anything.
 */
export async function applyReminderMode(m: ReminderMode): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  if (m !== "off") {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Notifications are off", "Enable notifications for RightNow in your device settings to get reminders.");
      return false;
    }
  }
  if (m === "daily") {
    config.hourlyReminderEnabled = false;
    await refreshHourlyReminder();
    config.dailyReminderEnabled = true;
    await scheduleDailyReminder(config.reminderHour);
  } else if (m === "hourly") {
    // The hourly nudge taps into a draw-over overlay (so your foreground app keeps
    // focus); that needs the "draw over other apps" permission.
    if (!(await canDrawOverlay())) {
      Alert.alert(
        "Allow the quick-log popup",
        "Hourly check-in shows a quick-log popup over whatever you're doing, so you don't have to switch apps. Grant RightNow permission to draw over other apps?",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open setting", onPress: () => { void requestOverlayPermission(); } },
        ],
      );
    }
    config.dailyReminderEnabled = false;
    await cancelDailyReminder();
    config.hourlyReminderEnabled = true;
    await refreshHourlyReminder();
  } else {
    config.dailyReminderEnabled = false;
    config.hourlyReminderEnabled = false;
    await cancelDailyReminder();
    await refreshHourlyReminder();
  }
  return true;
}
