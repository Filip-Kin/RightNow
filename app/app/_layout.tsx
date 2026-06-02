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
import { useTheme } from "@/lib/theme";

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
    restoreSession();
    maybeSyncHealthOnForeground();
    refreshHourlyReminder();
    startTaxonomyMirror(); // keep the overlay's plaintext activity mirror fresh
    drainQuickLogQueue(); // sync any answers the overlay/watch queued while we were away
    checkLaunchRoute();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        maybeSyncHealthOnForeground();
        refreshHourlyReminder();
        drainQuickLogQueue();
        checkLaunchRoute();
      }
    });
    return () => sub.remove();
  }, []);

  // Web width is capped per-screen (see components/ScreenContainer) rather than by
  // wrapping the navigator here, which would hide the bottom tab bar.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="session-expired" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="delete-data" options={{ headerShown: false }} />
        <Stack.Screen
          name="recovery-code"
          options={{ presentation: "modal", headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </GestureHandlerRootView>
  );
}
