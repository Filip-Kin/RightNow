import {
  requestNotificationPermissionsAsync,
  useNotificationGrantedState,
} from "@/lib/notification";
import { useRouter } from "expo-router";
import { Suspense } from "react";
import {
  Button,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView>
      <Suspense fallback={<></>}>
        <PermissionAlert />
      </Suspense>

      <View className="p-4">
        <Text style={{ fontSize: 32, fontWeight: "bold" }}>
          RightNow
        </Text>
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
          <Text>Log Right Now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
