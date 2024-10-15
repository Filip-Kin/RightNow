// Schedule a notification every hour
import * as Notifications from "expo-notifications";
import { NotificationPermissionsStatus } from "expo-notifications";
import { useEffect, useState } from "react";
import { requestPermissionsAsync } from "expo-notifications";
import { AppState } from "react-native";

export async function scheduleHourlyNotification() {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync(); // Clear any previous schedules
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Right Now",
      badge: 1,
      data: {},
      sticky: true,
      interruptionLevel: "passive",
      priority: "passive",
      sound: false,
    },
    identifier: "right-now",
    trigger: {
      minute: 0,
      repeats: true,
    },
  });
}

function getPermissionStatus() {
  return Notifications.getPermissionsAsync().then((result) => {
    notificationStatePermission = result;
    if (!result.granted && result.canAskAgain) {
      requestNotificationPermissionsAsync();
    } else if (result.granted) {
      scheduleHourlyNotification();
    }
  });
}

let notificationStatePermission: Promise<void> | NotificationPermissionsStatus =
  getPermissionStatus();

let listeners = new Set<Function>();

/** This hook updates when the state changes, including when the app is closed and re-focused */
export function useNotificationGrantedState(): NotificationPermissionsStatus {
  if (notificationStatePermission instanceof Promise) {
    throw notificationStatePermission;
  }

  const [value, update] = useState(notificationStatePermission);
  useEffect(() => {
    const listener = (newValue: any) => update(newValue);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, [update]);

  return value;
}

export async function requestNotificationPermissionsAsync() {
  const result = await requestPermissionsAsync();
  notificationStatePermission = result;
  for (const listener of listeners) {
    listener(result);
  }
  return result;
}

AppState.addEventListener("change", (status) => {
  if (
    status === "active" && !(notificationStatePermission instanceof Promise) &&
    !notificationStatePermission.granted
  ) {
    notificationStatePermission = getPermissionStatus();
  }
});
