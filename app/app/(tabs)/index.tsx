import { AnimatedText } from "@/components/AnimatedText";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useTheme } from "@/lib/theme";
import { useConfig } from "@/lib/config";
import { sync, useUnloggedHours } from "@/lib/entries";
import {
  requestNotificationPermissionsAsync,
  useNotificationGrantedState,
} from "@/lib/notification";
import { useRouter } from "expo-router";
import { Suspense, useEffect } from "react";
import {
  Button,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const router = useRouter();
  const c = useTheme();

  // Pull remote changes (and push anything pending) when the home screen opens.
  useEffect(() => {
    sync().catch(() => {/* offline: local state still works */});
  }, []);

  const config = useConfig();
  const behindCount = useUnloggedHours(config.catchUpWindowHours).length;

  return (
    <ScreenContainer>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Suspense fallback={<></>}>
        <PermissionAlert />
      </Suspense>

      <Text style={{ fontSize: 32, fontWeight: "bold", textAlign: "center", color: c.text, paddingVertical: 16 }}>
        RightNow
      </Text>

      {/* Center the circle in the remaining space, both axes. */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        {behindCount <= 0 ? (
          <View
            style={{
              borderWidth: 1, borderColor: c.borderFaint,
              alignItems: "center", justifyContent: "center",
              width: "62%", aspectRatio: 1, padding: 20,
              backgroundColor: c.surface, borderRadius: 9999,
            }}
          >
            <Text style={{ fontSize: 22, color: c.text, textAlign: "center" }}>You're all caught up!</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={{
              borderWidth: 1, borderColor: c.border,
              alignItems: "center", justifyContent: "center",
              width: "62%", aspectRatio: 1, padding: 20,
              backgroundColor: c.card, borderRadius: 9999,
            }}
            onPress={() => { router.push({ pathname: "/log" }); }}
          >
            <Text style={{ fontSize: 22, color: c.text, textAlign: "center" }}>
              Log {behindCount} {behindCount === 1 ? "entry" : "entries"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
    </ScreenContainer>
  );
}

function PermissionAlert() {
  const supported = useNotificationGrantedState();

  if (supported.granted) return null;

  return (
    <View className="bg-red-500 p-4 m-2 rounded-xl text-white">
      <Text
        style={{
          fontWeight: "bold",
          fontSize: 18,
          marginBottom: 8,
          color: "white",
        }}
      >
        Notification Permission Required
      </Text>
      <Text style={{ color: "white" }}>
        RightNow cannot send reminders without notification permissions.{" "}
        {!supported.canAskAgain &&
          "Please enable notifications in the Settings app."}
      </Text>
      {supported.canAskAgain && (
        <View className="mt-2">
          <Button
            title="Enable Notifications"
            color="white"
            onPress={() => {
              requestNotificationPermissionsAsync();
            }}
          />
        </View>
      )}
    </View>
  );
}
