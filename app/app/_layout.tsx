import "react-native-get-random-values"; // polyfill crypto.getRandomValues (must load before any crypto use)
import { Stack } from "expo-router";
import "../global.css";
import { useEffect } from "react";
import { useNotificationResponseHandler } from "@/lib/notification";
import { restoreSession } from "@/lib/auth";

export default function RootLayout() {
  useNotificationResponseHandler();
  useEffect(() => {
    restoreSession();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen
        name="recovery-code"
        options={{ presentation: "modal", headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="log"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
