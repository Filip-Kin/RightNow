// Theme tokens + hooks. Screens build their StyleSheet from a Colors palette via
// useThemedStyles(makeStyles), so light/dark/system flips the whole UI. The
// preference lives in config (light | dark | system); "system" follows the OS via
// useColorScheme. Activity/feeling colors are data and stay vivid on both themes.
import { useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { getThemePref, subscribeConfig, type ThemePref } from "./config";

export interface Colors {
  scheme: "light" | "dark";
  bg: string;          // screen background
  surface: string;     // cards / summary tiles / inputs
  surfaceAlt: string;  // detail bar / subtle raised surface
  surface2: string;    // round buttons, chips
  card: string;        // modal/card background
  cardBorder: string;  // hairline card/chart borders
  border: string;      // input / segment borders
  borderFaint: string; // detail separators
  text: string;        // primary text
  textBody: string;    // body text
  textMuted: string;   // secondary text
  textFaint: string;   // tertiary / axis labels
  primary: string;
  primaryDisabled: string;
  primarySoft: string; // tinted primary surface (e.g. nav buttons)
  onPrimary: string;
  danger: string;
  successText: string; // import success message
  successSoft: string; // import success background
  dangerSoft: string;  // destructive confirm background
  warnSoft: string;    // conflict tag background
  empty: string;       // empty grid cell
  track: string;       // chart track / bar background
  noteHighlight: string;
  noteBorder: string;
  noteDot: string;
  backdrop: string;    // modal scrim
  chartFill: string;   // area under the mood line
}

export const LIGHT: Colors = {
  scheme: "light",
  bg: "#ffffff",
  surface: "#f8f9fa",
  surfaceAlt: "#fafafa",
  surface2: "#f1f3f4",
  card: "#ffffff",
  cardBorder: "#eceff1",
  border: "#dadce0",
  borderFaint: "#e0e0e0",
  text: "#111111",
  textBody: "#3c4043",
  textMuted: "#5f6368",
  textFaint: "#9aa0a6",
  primary: "#1a73e8",
  primaryDisabled: "#a6c8f7",
  primarySoft: "#eef3fe",
  onPrimary: "#ffffff",
  danger: "#d93025",
  successText: "#137333",
  successSoft: "#e6f4ea",
  dangerSoft: "#fce8e6",
  warnSoft: "#fef7e0",
  empty: "#f0f0f0",
  track: "#eceff1",
  noteHighlight: "#ffe082",
  noteBorder: "#f5b800",
  noteDot: "#b06000",
  backdrop: "rgba(0,0,0,0.4)",
  chartFill: "rgba(26,115,232,0.12)",
};

export const DARK: Colors = {
  scheme: "dark",
  bg: "#121212",
  surface: "#1e1e1e",
  surfaceAlt: "#1a1a1a",
  surface2: "#2a2a2a",
  card: "#1e1e1e",
  cardBorder: "#2c2c2c",
  border: "#3a3a3a",
  borderFaint: "#2e2e2e",
  text: "#f5f5f5",
  textBody: "#e2e3e5",
  textMuted: "#b0b3b8",
  textFaint: "#8a8d91",
  primary: "#4c8ff0",
  primaryDisabled: "#2a456e",
  primarySoft: "#1c2a3f",
  onPrimary: "#ffffff",
  danger: "#f28b82",
  successText: "#81c995",
  successSoft: "#16301f",
  dangerSoft: "#3a1d1a",
  warnSoft: "#3a3416",
  empty: "#2a2a2a",
  track: "#2c2c2c",
  noteHighlight: "#4a3a16",
  noteBorder: "#8a6d1a",
  noteDot: "#e0a83c",
  backdrop: "rgba(0,0,0,0.6)",
  chartFill: "rgba(76,143,240,0.18)",
};

/** The active palette, reacting to both the config preference and the OS scheme. */
export function useTheme(): Colors {
  const system = useColorScheme();
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => subscribeConfig((c) => setPref(c.theme)), []);
  const mode = pref === "system" ? (system ?? "light") : pref;
  return mode === "dark" ? DARK : LIGHT;
}

/** Build a themed StyleSheet from a palette factory, memoized on the palette. */
export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const c = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}
