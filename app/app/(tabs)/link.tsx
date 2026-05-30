// Authenticated entry point for QR device linking (Settings -> Link a device).
import React from "react";
import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ScreenContainer";
import { LinkDevice } from "@/components/LinkDevice";
import { useTheme } from "@/lib/theme";

export default function LinkScreen() {
  const c = useTheme();
  return (
    <ScreenContainer>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={{ color: c.textMuted, lineHeight: 20 }}>
            Sign a new device in to this account without typing your password. One device
            shows a code and the other scans it; your encryption key is transferred end-to-end
            encrypted and never touches the server.
          </Text>
          <LinkDevice />
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}
