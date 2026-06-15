import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { makeTabItem } from "@/components/makeTabItem";
import { SyncGate } from "@/components/SyncGate";
import { useAuth } from "@/lib/auth";
import { useConfigValue } from "@/lib/config";
import { useTheme } from "@/lib/theme";

export default function TabLayout() {
  const { status } = useAuth();
  const config = useConfigValue();
  const c = useTheme();

  // Gate the app behind auth. While restoring a persisted session, render nothing.
  if (status === "loading") return null;
  // Server rejected our token: block the app behind the re-sign-in / export gate.
  if (status === "expired") return <Redirect href="/session-expired" />;
  // Web visitors land on the marketing page; the native app goes straight to login.
  if (status === "unauthenticated") {
    return <Redirect href={Platform.OS === "web" ? "/welcome" : "/auth/login"} />;
  }
  // Setup not done yet -> the home screen redirects to /setup (which runs the first
  // sync). Once setup is dismissed, block the whole app UI behind a full-screen sync
  // until the initial download finishes. Web has no setup flow, so skip the gate there.
  if (Platform.OS !== "web" && config && config.deviceSetupDone && !config.initialSyncDone) {
    return <SyncGate />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.cardBorder },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text },
        headerTintColor: c.primary,
      }}
    >
      {makeTabItem({ name: "index", title: "Right Now", icon: "home" })}
      {makeTabItem({ name: "history", title: "History", icon: "grid-on" })}
      {makeTabItem({ name: "insights", title: "Insights", icon: "insights" })}
      {makeTabItem({ name: "settings", title: "Settings", icon: "settings" })}
      {/* In the tab navigator (so the bottom bar stays) but hidden from the bar. */}
      <Tabs.Screen name="log" options={{ href: null }} />
      <Tabs.Screen name="link" options={{ href: null, headerShown: true, title: "Link a device" }} />
      <Tabs.Screen name="account" options={{ href: null, headerShown: true, title: "Backup login" }} />
      <Tabs.Screen name="activities" options={{ href: null, headerShown: true, title: "Activities" }} />
      <Tabs.Screen name="import" options={{ href: null, headerShown: true, title: "Import data" }} />
      <Tabs.Screen name="backup" options={{ href: null, headerShown: true, title: "Backup & restore" }} />
    </Tabs>
  );
}
