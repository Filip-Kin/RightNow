import { Tabs } from "expo-router";
import React from "react";

import { makeTabItem } from "@/components/makeTabItem";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {makeTabItem({ name: "index", title: "Right Now", icon: "home" })}
      {makeTabItem({ name: "settings", title: "Settings", icon: "settings" })}
    </Tabs>
  );
}
