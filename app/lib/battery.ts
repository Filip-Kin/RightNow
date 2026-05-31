// Ask Android to exempt the app from battery optimization (Doze), so the hourly
// reminder's alarm and the background sync aren't deferred when the phone is idle.
// We can't read the current state without a native module, so this just opens the
// system request dialog; the user taps Allow. No-op off Android.
import { Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";

export async function requestIgnoreBatteryOptimizations(packageName: string): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      { data: `package:${packageName}` },
    );
  } catch {
    // Fall back to the per-app battery settings list if the direct request fails.
    try {
      await IntentLauncher.startActivityAsync("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
    } catch {
      /* ignore */
    }
  }
}
