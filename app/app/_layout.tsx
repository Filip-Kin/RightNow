import "react-native-get-random-values"; // polyfill crypto.getRandomValues (must load before any crypto use)
import { Stack } from "expo-router";
import "../global.css";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { useNotificationResponseHandler } from "@/lib/notification";
import { restoreSession } from "@/lib/auth";

// On web the mobile layout would stretch across the whole window; constrain it to
// a centered phone-width column with the rest of the viewport as a neutral frame.
const isWeb = Platform.OS === "web";

export default function RootLayout() {
  useNotificationResponseHandler();
  useEffect(() => {
    restoreSession();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: isWeb ? "#e9eaed" : undefined }}>
      <View style={{ flex: 1, width: "100%", maxWidth: isWeb ? 480 : undefined, backgroundColor: "#fff" }}>
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
          <Stack.Screen name="activities" options={{ title: "Activities" }} />
          <Stack.Screen name="import" options={{ title: "Import data" }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
    </View>
  );
}
