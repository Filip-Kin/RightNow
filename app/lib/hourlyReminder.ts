// Hourly "what are you doing right now?" nudge.
//
// The notification + its hourly schedule are NATIVE (see plugins/withQuickLogOverlay):
// an AlarmManager fires each hour and posts a notification whose TAP starts the
// draw-over overlay Service directly (no activity launch, so the user's foreground
// app never loses focus). This JS module owns the *state* the native side reads:
//   - quicklog-reminder.json: { enabled, streak0, t0, cap } so native computes the
//     escalating "last N hours" body text without needing the decryption key (the
//     streak only grows while the app is closed, since you can only log via the
//     overlay/app). Refreshed on app open / foreground / after each entry change.
//   - It arms/disarms the native AlarmManager via the QuickLog native module.
// The expo-background-fetch task is the Doze safety-net that drains the quick-log
// queue (and refreshes the streak) when the instant headless wake is throttled.
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { File, Paths } from "expo-file-system";
import { NativeModules, Platform } from "react-native";
import { getConfig } from "./config";
import { subscribeEntries, trailingUnloggedStreak, loadStore } from "./entries";

const HOURLY_TASK = "right-now-hourly-update";
const REMINDER_FILE = "quicklog-reminder.json";
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_CAP = 24;

const QuickLog: {
  arm(): Promise<boolean>;
  disarm(): Promise<boolean>;
  canDrawOverlay(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  consumeLaunchRoute(): Promise<string | null>;
} | undefined = NativeModules.QuickLog;

/** If the app was launched via the notification's "Open in app" action, returns
 *  the route to open ("log") once, then clears it. */
export async function consumeQuickLogLaunchRoute(): Promise<string | null> {
  try { return (await QuickLog?.consumeLaunchRoute()) ?? null; } catch { return null; }
}

/** The notification text for an N-hour unlogged streak (kept for any JS-side use). */
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

interface ReminderState { enabled: boolean; streak0: number; t0: number; cap: number }

function writeReminder(state: ReminderState): void {
  try {
    const f = new File(Paths.document, REMINDER_FILE);
    if (!f.exists) f.create();
    f.write(JSON.stringify(state));
  } catch { /* best-effort */ }
}

/** Whether the OS overlay (draw-over-apps) permission is granted. */
export async function canDrawOverlay(): Promise<boolean> {
  try { return (await QuickLog?.canDrawOverlay()) ?? false; } catch { return false; }
}

/** Open the system "draw over other apps" screen for RightNow. */
export async function requestOverlayPermission(): Promise<void> {
  try { await QuickLog?.requestOverlayPermission(); } catch { /* ignore */ }
}

// #region background safety-net (drain queue + advance streak under Doze)
if (Platform.OS !== "web") {
  TaskManager.defineTask(HOURLY_TASK, async () => {
    try {
      const cfg = getConfig();
      if (!cfg?.hourlyReminderEnabled) return BackgroundFetch.BackgroundFetchResult.NoData;
      // Drain any overlay/watch answers (also refreshes the streak baseline below).
      try {
        const { restoreSession } = await import("./auth");
        const { drainQuickLogQueue } = await import("./quickLog");
        await restoreSession();
        await drainQuickLogQueue();
      } catch { /* leave queue for next wake */ }
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

async function registerTask() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(HOURLY_TASK)) return;
    await BackgroundFetch.registerTaskAsync(HOURLY_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch { /* unavailable (web) */ }
}

async function unregisterTask() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(HOURLY_TASK)) await BackgroundFetch.unregisterTaskAsync(HOURLY_TASK);
  } catch { /* ignore */ }
}
// #endregion

let refreshing = false;

/**
 * Reconcile the native hourly nudge with current state. Call on app start, on
 * foreground, on toggle, and after any entry change. Writes the reminder-state file
 * the native scheduler reads, then arms/disarms the native AlarmManager. Idempotent.
 */
export async function refreshHourlyReminder(now: number = Date.now()): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const cfg = getConfig();
    const enabled = !!cfg?.hourlyReminderEnabled;
    const cap = cfg?.catchUpWindowHours ?? DEFAULT_CAP;

    if (!enabled) {
      writeReminder({ enabled: false, streak0: 0, t0: startOfHour(now), cap });
      await QuickLog?.disarm().catch(() => {});
      await unregisterTask();
      return;
    }

    await loadStore();
    const streak = trailingUnloggedStreak(cap, now);
    writeReminder({ enabled: true, streak0: streak, t0: startOfHour(now), cap });
    await QuickLog?.arm().catch(() => {});
    await registerTask();
  } finally {
    refreshing = false;
  }
}

// Refresh as soon as the user logs (or any entry changes). Debounced so a bulk
// import doesn't thrash the scheduler.
let debounce: ReturnType<typeof setTimeout> | null = null;
subscribeEntries(() => {
  if (!getConfig()?.hourlyReminderEnabled) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void refreshHourlyReminder(), 800);
});
