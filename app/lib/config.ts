import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

export interface Config {
  hour24: boolean;
  reminderHour: number; // local hour (0-23) for the daily end-of-day reminder
  // Reminder style is one choice: a single daily end-of-day reminder, OR an hourly
  // check-in, OR off (you don't want both). These two flags are kept mutually
  // exclusive by the Settings control.
  dailyReminderEnabled: boolean;
  // Nudge at the end of every hour to log the current hour. A single high-priority
  // notification that escalates ("last N hours") while ignored and clears once
  // you've caught up.
  hourlyReminderEnabled: boolean;
  // How far back the catch-up flow looks for unlogged hours. Bounds the "to log"
  // count so a year-old import never demands thousands of entries.
  catchUpWindowHours: number;
  theme: ThemePref; // light | dark | follow system
  // Auto-fill the Sleep activity from the device's Health platform (Android Health
  // Connect for now). Only fills hours you haven't logged; never overwrites a
  // manual entry. iOS/HealthKit is a later pass.
  healthSleepEnabled: boolean;
  lastHealthSyncAt: number; // epoch ms of the last successful health read (0 = never)
  // Whether the post-sign-in "set up this device" flow has been completed/dismissed
  // on this device (notifications, battery optimization, Health permissions).
  deviceSetupDone: boolean;
  // Whether the first full sign-in sync has completed on this device. The initial-sync
  // gate blocks the app UI until this flips true (set once, permanently).
  initialSyncDone: boolean;
  // Detect device-timezone changes and handle them (DST blend + the travel prompt
  // that resamples transit onto the grid). On by default.
  timezoneHandlingEnabled: boolean;
}

const listeners = new Set<(config: Config) => void>();

function parse(value: string | null): Config {
  const config = JSON.parse(value ?? "{}");
  config.hour24 ??= false;
  config.reminderHour ??= 21;
  config.dailyReminderEnabled ??= true;
  config.hourlyReminderEnabled ??= false;
  config.catchUpWindowHours ??= 24;
  config.theme ??= "system";
  config.healthSleepEnabled ??= false;
  config.lastHealthSyncAt ??= 0;
  config.deviceSetupDone ??= false;
  config.initialSyncDone ??= false;
  config.timezoneHandlingEnabled ??= true;
  return config;
}

/** Subscribe to config changes without the Suspense throw of useConfig (safe in
 *  any component, e.g. the theme hook). */
export function subscribeConfig(fn: (config: Config) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Current theme preference (or "system" before config has loaded). */
export function getThemePref(): ThemePref {
  return config?.theme ?? "system";
}

/** The live config proxy (mutations persist + notify). Undefined before load. */
export function getConfig(): Config | undefined {
  return config;
}

/** Resolve the config proxy, awaiting the initial load if needed. */
export async function ensureConfig(): Promise<Config> {
  return config ?? (await configLoading!);
}

let config!: Config;
let configLoading: Promise<Config> | null = AsyncStorage.getItem("config").then((value) => {
  config = new Proxy(parse(value), configHandlers) as Config;
  configLoading = null;
  listeners.forEach((listener) => listener(config));
  return config;
});

const configHandlers: ProxyHandler<object> = {
  get(target, p, receiver) {
    const obj = Reflect.get(target, p, receiver);
    if (typeof obj === "object" && obj !== null) {
      return new Proxy(obj, configHandlers);
    }
    return obj;
  },
  set(target, p, value, receiver) {
    Reflect.set(target, p, value, receiver);
    update();
    return true;
  },
};

function update() {
  AsyncStorage.setItem("config", JSON.stringify(config));
  listeners.forEach((listener) => listener(config));
}

export function resetConfig() {
  config = new Proxy(parse(null), configHandlers) as Config;
  update();
}

/** Like useConfig but never suspends: returns undefined until config has loaded, then
 *  re-renders. Use where there is no Suspense boundary above (e.g. a layout route). */
export function useConfigValue(): Config | undefined {
  const [, forceUpdate] = useState(0);
  useEffect(() => subscribeConfig(() => forceUpdate((n) => n + 1)), []);
  return config;
}

export function useConfig() {
  if (!config && configLoading) {
    throw configLoading;
  }

  const [_, forceUpdate] = useState(0);

  useEffect(() => {
    function listener(config: Config) {
      forceUpdate((n) => n + 1);
    }
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);

  return config;
}