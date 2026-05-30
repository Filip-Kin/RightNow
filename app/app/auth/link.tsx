// New-device entry point for QR sign-in (from the login screen). When the link
// completes, persistSession flips auth state and the auth layout redirects to "/".
import React from "react";
import { ScrollView, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { LinkDevice } from "@/components/LinkDevice";
import { useTheme } from "@/lib/theme";

export default function AuthLinkScreen() {
  const c = useTheme();
  const router = useRouter();
  return (
    <ScreenContainer>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: c.text }}>Sign in with another device</Text>
          <Text style={{ color: c.textMuted, marginTop: 8, lineHeight: 20 }}>
            On a device that's already signed in, open Settings → Link a device. Then show this
            code to it (or scan its code) to sign in here without your password.
          </Text>
          <LinkDevice />
          <TouchableOpacity onPress={() => router.replace("/auth/login")} style={{ padding: 12, alignItems: "center" }}>
            <Text style={{ color: c.primary, fontWeight: "600" }}>Back to password sign-in</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}
