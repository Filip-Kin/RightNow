import { Stack } from "expo-router";
import "../global.css";
import { useNotificationResponseHandler } from "@/lib/notification";

export default function RootLayout() {
  useNotificationResponseHandler();
  return (
    <Stack>
      <Stack.Screen
        name="log"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
