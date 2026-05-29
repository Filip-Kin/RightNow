import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export interface Config {
  hour24: boolean;
  reminderHour: number; // local hour (0-23) for the daily end-of-day reminder
  // How far back the catch-up flow looks for unlogged hours. Bounds the "to log"
  // count so a year-old import never demands thousands of entries.
  catchUpWindowHours: number;
}

const listeners = new Set<(config: Config) => void>();

function parse(value: string | null): Config {
  const config = JSON.parse(value ?? "{}");
  config.hour24 ??= false;
  config.reminderHour ??= 21;
  config.catchUpWindowHours ??= 24;
  return config;
}

let config!: Config;
let configLoading: Promise<Config> | null = AsyncStorage.getItem("config").then((value) => {
  config = new Proxy(
    parse(value),
    configHandlers,
  );
  configLoading = null;
  listeners.forEach((listener) => listener(config));
  return config;
});

const configHandlers: ProxyHandler<any> = {
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
  config = new Proxy(
    parse(null),
    configHandlers,
  );
  update();
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