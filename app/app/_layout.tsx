import "react-native-get-random-values"; // polyfill crypto.getRandomValues (must load before any crypto use)
import { Stack } from "expo-router";
import "../global.css";
import { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useNotificationResponseHandler } from "@/lib/notification";
import { restoreSession } from "@/lib/auth";
import { maybeSyncHealthOnForeground } from "@/lib/healthSync";
import { refreshHourlyReminder } from "@/lib/hourlyReminder";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const c = useTheme();
  useNotificationResponseHandler();
  useEffect(() => {
    restoreSession();
    maybeSyncHealthOnForeground();
    refreshHourlyReminder();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        maybeSyncHealthOnForeground();
        refreshHourlyReminder();
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
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen
          name="recovery-code"
          options={{ presentation: "modal", headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </GestureHandlerRootView>
  );
}
