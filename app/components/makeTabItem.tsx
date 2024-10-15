// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/

import { Tabs } from "expo-router";

import Ionicons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps } from "react";

export function makeTabItem(opts: {
  name: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Tabs.Screen
      name={opts.name}
      options={{
        title: opts.title,
        tabBarIcon: (props) => (
          <Ionicons
            size={28}
            style={{ marginBottom: -3, color: props.color }}
            name={opts.icon}
          />
        ),
      }}
    />
  );
}
