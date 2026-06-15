import { AnimatedText } from "@/components/AnimatedText";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useTheme } from "@/lib/theme";
import { useConfig } from "@/lib/config";
import { sync, seedFilledFromStore, useStoreLoaded } from "@/lib/entries";
import { useToAsk } from "@/lib/filledHours";
import { useTzStatus } from "@/lib/timezone";
import { useAuth } from "@/lib/auth";
import {
  requestNotificationPermissionsAsync,
  useNotificationGrantedState,
} from "@/lib/notification";
import { Redirect, useRouter } from "expo-router";
import { Suspense, useEffect } from "react";
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
  const auth = useAuth();
  const storeLoaded = useStoreLoaded();
  const needsSetup = !config.deviceSetupDone;

  // Seed the shared filled-ledger from this device's logged hours as soon as the store
  // + DEK are ready, so the "behind" count is right before the network sync finishes.
  useEffect(() => {
    if (storeLoaded) seedFilledFromStore();
  }, [storeLoaded, auth.status]);

  // Pull remote changes (and push anything pending) when the home screen opens, to
  // refresh on subsequent launches. The first sign-in's full download is handled by
  // the setup flow + the initial-sync gate (see (tabs)/_layout), so just fire and
  // forget here. When the device-setup flow is pending it runs the first sync instead.
  useEffect(() => {
    if (needsSetup) return;
    sync().catch(() => {/* offline: local state still works */});
  }, [needsSetup]);

  const behindCount = useToAsk(config.catchUpWindowHours).length;
  const { transit } = useTzStatus();

  // First sign-in on a device: run the one-time setup/permissions flow.
  if (needsSetup) return <Redirect href="/setup" />;

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
        ) : transit ? (
          <TouchableOpacity
            style={{
              borderWidth: 1, borderColor: c.border,
              alignItems: "center", justifyContent: "center",
              width: "62%", aspectRatio: 1, padding: 20,
              backgroundColor: c.card, borderRadius: 9999,
            }}
            onPress={() => { router.push({ pathname: "/travel" }); }}
          >
            <Text style={{ fontSize: 22, color: c.text, textAlign: "center" }}>You're traveling</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: "center", marginTop: 6 }}>Tap when you land</Text>
          </TouchableOpacity>
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
