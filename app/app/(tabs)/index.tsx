import { AnimatedText } from "@/components/AnimatedText";
import { ScreenContainer } from "@/components/ScreenContainer";
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
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function HomeScreen() {
  const router = useRouter();

  // Pull remote changes (and push anything pending) when the home screen opens.
  useEffect(() => {
    sync().catch(() => {/* offline: local state still works */});
  }, []);

  const config = useConfig();
  const behindCount = useUnloggedHours(config.catchUpWindowHours).length;

  return (
    <ScreenContainer>
    <SafeAreaView>
      <Suspense fallback={<></>}>
        <PermissionAlert />
      </Suspense>

      <View className="p-4">
        <Text style={{ fontSize: 32, fontWeight: "bold", textAlign: "center" }}>
          RightNow
        </Text>
        {behindCount <= 0
          ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.1)",
                alignItems: "center",
                justifyContent: "center",
                width: "50%",
                aspectRatio: 1,
                backgroundColor: "#fff5",
                borderRadius: 9999,
                margin: "auto",
                marginTop: 32,
              }}
            >
              <Text style={{ fontSize: 24 }}>You're all caught up!</Text>
            </View>
          )
          : (
            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.2)",
                alignItems: "center",
                justifyContent: "center",
                width: "50%",
                aspectRatio: 1,
                backgroundColor: "#fff",
                borderRadius: 9999,
                margin: "auto",
                marginTop: 32,
              }}
              onPress={() => {
                router.push({ pathname: "/log" });
              }}
            >
              <Text style={{ fontSize: 24 }}>
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
