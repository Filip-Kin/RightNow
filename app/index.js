// Custom entry point. Registers the headless JS task BEFORE expo-router's entry
// loads, so the native HeadlessJsTaskService (started by the quick-log overlay or
// the Wear OS listener) can invoke it to drain the plaintext answer queue into the
// encrypted store even when the app UI is killed.
import { AppRegistry, Platform } from "react-native";

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
  });
}

// Hand off to expo-router's normal entry (registers the main app component).
import "expo-router/entry";
