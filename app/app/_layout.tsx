import "react-native-get-random-values"; // polyfill crypto.getRandomValues (must load before any crypto use)
import { Stack, useRouter } from "expo-router";
import "../global.css";
import { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useNotificationResponseHandler } from "@/lib/notification";
import { restoreSession } from "@/lib/auth";
import { maybeSyncHealthOnForeground } from "@/lib/healthSync";
import { refreshHourlyReminder, consumeQuickLogLaunchRoute } from "@/lib/hourlyReminder";
import { startTaxonomyMirror, drainQuickLogQueue } from "@/lib/quickLog";
import { reloadFilled } from "@/lib/filledHours";
import { detectTimezoneChange, drainPendingTz, hasPendingTravel } from "@/lib/timezone";
import { useTheme } from "@/lib/theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RootLayout() {
  const c = useTheme();
  const router = useRouter();
  useNotificationResponseHandler();
  useEffect(() => {
    // Route to /log if launched via the notification's "Open in app" action.
    async function checkLaunchRoute() {
      if ((await consumeQuickLogLaunchRoute()) === "log") {
        router.navigate("/");
        setTimeout(() => router.push("/log"), 50);
      }
    }
    // Detect a device-timezone change (DST blend silently; a flight raises the
    // travel prompt). Replays any resolution that was deferred while locked.
    async function checkTimezone() {
      try {
        const res = await detectTimezoneChange();
        await drainPendingTz();
        if (res.needsPrompt || hasPendingTravel()) {
          router.navigate("/");
          setTimeout(() => router.push("/travel"), 50);
        }
      } catch { /* never block startup on tz handling */ }
    }
    // Health sleep-fill needs the DEK, which restoreSession only sets once secure
    // storage resolves. Running it before (cold start) throws "Locked", fills nothing
    // and never retries - the "sleep only shows after I close and reopen" bug. Chain
    // it (and the queue drain, which also needs the key) onto the restore.
    restoreSession().then(() => {
      maybeSyncHealthOnForeground();
      drainQuickLogQueue(); // sync any answers the overlay/watch queued while we were away
    });
    refreshHourlyReminder();
    startTaxonomyMirror(); // keep the overlay's plaintext activity mirror fresh
    checkLaunchRoute();
    checkTimezone();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        reloadFilled(); // pick up hours the overlay/watch filled while backgrounded
        maybeSyncHealthOnForeground();
        refreshHourlyReminder();
        drainQuickLogQueue();
        checkLaunchRoute();
        checkTimezone();
      }
    });
    return () => sub.remove();
  }, []);

  // Web width is capped per-screen (see components/ScreenContainer) rather than by
  // wrapping the navigator here, which would hide the bottom tab bar.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="session-expired" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="delete-data" options={{ headerShown: false }} />
        <Stack.Screen name="catchup" options={{ headerShown: false }} />
        <Stack.Screen name="travel" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen
          name="recovery-code"
          options={{ presentation: "modal", headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
