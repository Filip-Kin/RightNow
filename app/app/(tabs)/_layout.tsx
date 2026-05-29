import { Redirect, Tabs } from "expo-router";
import React from "react";

import { makeTabItem } from "@/components/makeTabItem";
import { useAuth } from "@/lib/auth";

export default function TabLayout() {
  const { status } = useAuth();

  // Gate the app behind auth. While restoring a persisted session, render nothing.
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Redirect href="/auth/login" />;

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {makeTabItem({ name: "index", title: "Right Now", icon: "home" })}
      {makeTabItem({ name: "settings", title: "Settings", icon: "settings" })}
    </Tabs>
  );
}
