import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { makeTabItem } from "@/components/makeTabItem";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function TabLayout() {
  const { status } = useAuth();
  const c = useTheme();

  // Gate the app behind auth. While restoring a persisted session, render nothing.
  if (status === "loading") return null;
  // Web visitors land on the marketing page; the native app goes straight to login.
  if (status === "unauthenticated") {
    return <Redirect href={Platform.OS === "web" ? "/welcome" : "/auth/login"} />;
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
      <Tabs.Screen name="year" options={{ href: null, headerShown: true, title: "Year view" }} />
      <Tabs.Screen name="activities" options={{ href: null, headerShown: true, title: "Activities" }} />
      <Tabs.Screen name="import" options={{ href: null, headerShown: true, title: "Import data" }} />
    </Tabs>
  );
}
