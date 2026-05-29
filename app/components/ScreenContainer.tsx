// Caps and centers a screen's content on web so the mobile-first UI doesn't
// stretch across a wide desktop window. No-op on native (full width). Applied
// per screen rather than around the navigator, which would hide the tab bar.
import React from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";

export function ScreenContainer({ children, maxWidth = 640, style }: {
  children: React.ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flex: 1, width: "100%" },
        Platform.OS === "web" ? { maxWidth, alignSelf: "center" } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
