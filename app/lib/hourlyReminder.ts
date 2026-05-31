// Hourly "what are you doing right now?" nudge.
//
// One high-priority notification (single tray entry, never stacks) that fires at
// the end of each hour, deep-links into the submission UI, escalates to "the last
// N hours" while ignored, and clears once you've caught up.
//
// How the pieces meet the platform's limits:
//   - A repeating OS-level trigger (iOS calendar @ :00, Android hourly interval)
//     guarantees the nudge keeps arriving while the app is fully terminated. Same
//     identifier => it replaces in place rather than stacking.
//   - The body is fixed at schedule time, so a tiny background-fetch task advances
//     the escalating text ("last N hours") while closed. Crucially it needs NO
//     decryption key: you can only log by opening the app, so while the app is
//     closed the unlogged streak only ever grows by one per elapsed hour. The task
//     just adds elapsed hours to a plaintext baseline written when the app was last
//     open. Background fetch is best-effort (esp. iOS / Android doze); the repeating
//     trigger is the reliable backstop and the app re-syncs everything on foreground.
import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getConfig } from "./config";
import { subscribeEntries, trailingUnloggedStreak, loadStore } from "./entries";

export const HOURLY_ID = "right-now-hourly";
const HOURLY_CHANNEL = "hourly";
const HOURLY_TASK = "right-now-hourly-update";
const BASELINE_KEY = "rn_hourly_baseline";
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_CAP = 24;

interface Baseline {
  enabled: boolean;
  streak0: number; // unlogged streak when the app was last open
  t0: number; // start-of-hour epoch ms at that moment
  cap: number; // max hours to count back
}

/** The notification text for an N-hour unlogged streak. */
export function reminderBody(streak: number): string {
  return streak >= 2
    ? `What have you been doing the last ${streak} hours? Tap to fill them in.`
    : "What are you doing right now? Tap to log this hour.";
}

function startOfHour(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

// Android O+ needs a channel, and MAX importance is what keeps this pinned near
// the top of the shade (the user asked for highest priority).
async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(HOURLY_CHANNEL, {
    name: "Hourly check-in",
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: false,
  });
}

function content(streak: number) {
  return {
    title: "RightNow",
    body: reminderBody(streak),
    data: { kind: "hourly" },
    interruptionLevel: "timeSensitive" as const,
  };
}

function nextHourBoundary(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  if (d.getTime() <= now) d.setHours(d.getHours() + 1);
  return d.getTime();
}

// Schedule the next end-of-hour delivery as a one-shot DATE trigger (same id, so it
// replaces in the tray instead of stacking). A DATE trigger fires at the given time
// and - unlike a repeating TIME_INTERVAL on Android, which fires immediately when
// scheduled - never fires on schedule, so reconciling on every app open no longer
// spawns a duplicate notification. The background task re-runs this to chain the
// following hours while the app is closed.
async function scheduleNext(streak0: number, now: number, cap: number) {
  await Notifications.cancelScheduledNotificationAsync(HOURLY_ID).catch(() => {});
  const streak = Math.min(streak0 + 1, cap);
  await Notifications.scheduleNotificationAsync({
    identifier: HOURLY_ID,
    content: content(streak),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextHourBoundary(now),
      channelId: HOURLY_CHANNEL,
    },
  });
}

async function clearDelivered() {
  await Notifications.dismissNotificationAsync(HOURLY_ID).catch(() => {});
}

async function writeBaseline(b: Baseline) {
  await AsyncStorage.setItem(BASELINE_KEY, JSON.stringify(b));
}

// #region background task (DEK-free escalation while the app is terminated)
// Native only - TaskManager/BackgroundFetch have no working web implementation.
if (Platform.OS !== "web") {
  TaskManager.defineTask(HOURLY_TASK, async () => {
  try {
    const raw = await AsyncStorage.getItem(BASELINE_KEY);
    if (!raw) return BackgroundFetch.BackgroundFetchResult.NoData;
    const b: Baseline = JSON.parse(raw);
    if (!b.enabled) return BackgroundFetch.BackgroundFetchResult.NoData;
    const cap = b.cap ?? DEFAULT_CAP;
    const elapsed = Math.max(0, Math.floor((Date.now() - b.t0) / HOUR_MS));
    const streak = Math.min(b.streak0 + elapsed, cap);
    await ensureChannel();
    // Keep the next-hour delivery scheduled (DATE trigger, never fires immediately).
    await scheduleNext(streak, Date.now(), cap);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
  });
}

async function registerTask() {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(HOURLY_TASK);
    if (already) return;
    await BackgroundFetch.registerTaskAsync(HOURLY_TASK, {
      minimumInterval: 15 * 60, // seconds; OS clamps/batches this
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background fetch unavailable (e.g. web) - the repeating trigger still works.
  }
}

async function unregisterTask() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(HOURLY_TASK)) {
      await BackgroundFetch.unregisterTaskAsync(HOURLY_TASK);
    }
  } catch {
    /* ignore */
  }
}
// #endregion

let refreshing = false;

/**
 * Reconcile the hourly nudge with current state. Call on app start, on foreground,
 * on toggle, and after any entry change. Cheap and idempotent.
 */
export async function refreshHourlyReminder(now: number = Date.now()): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const cfg = getConfig();
    const enabled = !!cfg?.hourlyReminderEnabled;
    const cap = cfg?.catchUpWindowHours ?? DEFAULT_CAP;

    if (!enabled) {
      await Notifications.cancelScheduledNotificationAsync(HOURLY_ID).catch(() => {});
      await clearDelivered();
      await writeBaseline({ enabled: false, streak0: 0, t0: startOfHour(now), cap });
      await unregisterTask();
      return;
    }

    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return; // settings UI handles asking
    await ensureChannel();
    await loadStore();

    const streak = trailingUnloggedStreak(cap, now);
    await writeBaseline({ enabled: true, streak0: streak, t0: startOfHour(now), cap });
    await registerTask();

    if (streak === 0) {
      await clearDelivered(); // caught up -> remove the current nudge
    }
    // Schedule the next end-of-hour delivery (DATE trigger; won't fire now).
    await scheduleNext(streak, now, cap);
  } finally {
    refreshing = false;
  }
}

// Clear/refresh as soon as the user logs (or any entry changes). Debounced so a
// bulk import doesn't thrash the scheduler.
let debounce: ReturnType<typeof setTimeout> | null = null;
subscribeEntries(() => {
  if (!getConfig()?.hourlyReminderEnabled) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void refreshHourlyReminder(), 800);
});
