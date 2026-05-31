import { AnimatedText } from "@/components/AnimatedText";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useTheme } from "@/lib/theme";
import { useConfig } from "@/lib/config";
import { sync, useUnloggedHours, useStoreLoaded } from "@/lib/entries";
import {
  requestNotificationPermissionsAsync,
  useNotificationGrantedState,
} from "@/lib/notification";
import { Redirect, useRouter } from "expo-router";
import { Suspense, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const config = useConfig();
  const storeLoaded = useStoreLoaded();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const needsSetup = !config.deviceSetupDone;

  // Pull remote changes (and push anything pending) when the home screen opens. On a
  // fresh sign-in this downloads everything, so report progress to a download screen.
  // When the device-setup flow is pending it runs the first sync instead, so skip here.
  useEffect(() => {
    if (needsSetup) return;
    sync((done, total) => setProgress({ done, total }))
      .catch(() => {/* offline: local state still works */})
      .finally(() => setProgress(null));
  }, [needsSetup]);

  const behindCount = useUnloggedHours(config.catchUpWindowHours).length;

  // First sign-in on a device: run the one-time setup/permissions flow.
  if (needsSetup) return <Redirect href="/setup" />;

  // First sign-in pulls a lot; show a download screen instead of a frozen-looking app.
  if (progress && progress.total > 20 && progress.done < progress.total) {
    const pct = Math.round((progress.done / progress.total) * 100);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }} edges={["top"]}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text, marginBottom: 8 }}>Downloading your data…</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: 20 }}>{progress.done.toLocaleString()} / {progress.total.toLocaleString()} hours</Text>
        <View style={{ width: "80%", maxWidth: 360, height: 10, borderRadius: 5, backgroundColor: c.track, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.primary, borderRadius: 5 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenContainer>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Suspense fallback={<></>}>
        <PermissionAlert />
      </Suspense>

      <View style={{ alignItems: "center", paddingVertical: 16 }}>
        <Image
          source={require("../../assets/images/icon-512.png")}
          style={{ width: 56, height: 56 }}
          resizeMode="contain"
          accessibilityLabel="RightNow"
        />
      </View>

      {/* Center the circle in the remaining space, both axes. */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        {!storeLoaded ? (
          // Don't flash a bogus "log N entries" before the store has loaded.
          <View
            style={{
              borderWidth: 1, borderColor: c.borderFaint,
              alignItems: "center", justifyContent: "center",
              width: "62%", aspectRatio: 1, padding: 20,
              backgroundColor: c.surface, borderRadius: 9999,
            }}
          >
            <ActivityIndicator color={c.primary} />
          </View>
        ) : behindCount <= 0 ? (
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
