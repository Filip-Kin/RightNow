// Custom entry point. Registers the headless JS task BEFORE expo-router's entry
// loads, so the native HeadlessJsTaskService (started by the quick-log overlay or
// the Wear OS listener) can invoke it to drain the plaintext answer queue into the
// encrypted store even when the app UI is killed.
import { AppRegistry, NativeModules, Platform } from "react-native";

// Global JS error handler: log any uncaught JS error so it's diagnosable instead of
// vanishing, then delegate to the previous handler so we don't change fatal behavior.
// This covers the JS layer only; native-module crashes bypass JS entirely.
{
  const EU = global.ErrorUtils;
  if (EU && typeof EU.setGlobalHandler === "function") {
    const prev = typeof EU.getGlobalHandler === "function" ? EU.getGlobalHandler() : null;
    EU.setGlobalHandler((error, isFatal) => {
      try { console.error("[global-js-error]", isFatal ? "FATAL" : "non-fatal", error); } catch {}
      if (prev) prev(error, isFatal);
    });
  }
}

if (Platform.OS === "android") {
  // Name must match the task the native MyHeadlessJsService returns from
  // getTaskConfig() (see the withQuickLogOverlay config plugin).
  AppRegistry.registerHeadlessTask("RightNowQuickLogDrain", () => async () => {
    try {
      const { restoreSession } = await import("./lib/auth");
      const { drainQuickLogQueue } = await import("./lib/quickLog");
      await restoreSession(); // load the cached DEK into memory for this JS context
      await drainQuickLogQueue();
    } catch {
      /* leave the queue for the next wake / background-fetch */
    }
    // Fill sleep from Health Connect in the background, so the hourly nudge (which
    // the alarm kicks this task from) stops nagging for hours you were asleep - and
    // then ask the native scheduler to drop those hours from the live notification.
    // Guarded exactly like the foreground path: only after one successful manual
    // sync (never auto-run the Health layer cold), and throttled hourly inside.
    try {
      const { ensureConfig, getConfig } = await import("./lib/config");
      await ensureConfig();
      const cfg = getConfig();
      if (cfg?.healthSleepEnabled && cfg.lastHealthSyncAt > 0) {
        const { syncHealthSleep } = await import("./lib/healthSync");
        await syncHealthSleep(); // opts default -> no permission prompt (background)
        const { flushFilled } = await import("./lib/filledHours");
        await flushFilled(); // ledger on disk before native re-reads it
      }
      // Recompute/cancel the posted notification against the (now sleep-filled) ledger.
      try { await NativeModules.QuickLog?.refreshNotification?.(); } catch { /* older native */ }
    } catch {
      /* health unavailable / locked: the notification just isn't refreshed this tick */
    }
  });
}

// Hand off to expo-router's normal entry (registers the main app component).
import "expo-router/entry";
