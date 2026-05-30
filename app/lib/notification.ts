// One daily end-of-day reminder that deep-links into the hour-by-hour catch-up.
import * as Notifications from "expo-notifications";
import { NotificationPermissionsStatus } from "expo-notifications";
import { useEffect, useState } from "react";
import { requestPermissionsAsync } from "expo-notifications";
import { Alert, AppState, Platform } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { setSyncStatusListener } from "./entries";

const DEFAULT_REMINDER_HOUR = 21;
const SYNC_WARN_ID = "right-now-sync-failed";

// Without a handler, expo-notifications suppresses notifications while the app is
// foregrounded - which is exactly when the "test" fires - so they never showed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Android (O+) needs a channel or notifications silently never display.
async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/** Schedule (or reschedule) the daily reminder at the given local hour. */
export async function scheduleDailyReminder(hour: number = DEFAULT_REMINDER_HOUR) {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await ensureAndroidChannel();

  await Notifications.cancelAllScheduledNotificationsAsync(); // replace any previous schedule
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "RightNow",
      body: "How was your day? Tap to fill in your hours.",
      badge: 1,
      data: {},
      interruptionLevel: "active",
    },
    identifier: "right-now",
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute: 0,
      repeats: true,
    },
  });
}

/** Fire a one-off notification shortly, for testing from Settings. Requests
 *  permission if needed and tells the user when it's blocked, so the button can't
 *  silently do nothing. */
export async function scheduleTestNotification() {
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await requestPermissionsAsync();
  }
  if (!permission.granted) {
    Alert.alert("Notifications are off", "Enable notifications for RightNow in your device settings to receive reminders.");
    return;
  }
  await ensureAndroidChannel();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "RightNow",
      body: "Test notification - reminders are working. ✅",
      badge: 1,
      data: {},
      interruptionLevel: "active",
    },
    identifier: "right-now-test",
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
}

// #region sync-failure warning
// When the device can reach the server but keeps getting rejected (status "error",
// e.g. an invalid session), warn the user with a notification that repeats daily
// until a sync succeeds. Pure offline ("offline") stays quiet - it just retries.
async function scheduleSyncFailureWarning() {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "RightNow isn't syncing",
      body: "Your entries aren't backing up to your account. Open RightNow and sign in again.",
      data: { kind: "sync" },
      interruptionLevel: "active",
    },
    identifier: SYNC_WARN_ID, // same id replaces any existing schedule
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 24 * 60 * 60, repeats: true },
  });
}

async function cancelSyncFailureWarning() {
  await Notifications.cancelScheduledNotificationAsync(SYNC_WARN_ID).catch(() => {});
}

setSyncStatusListener((status) => {
  if (status === "error") scheduleSyncFailureWarning().catch(() => {});
  else if (status === "ok") cancelSyncFailureWarning().catch(() => {});
});
// #endregion

function getPermissionStatus() {
  return Notifications.getPermissionsAsync().then((result) => {
    notificationStatePermission = result;
    if (!result.granted && result.canAskAgain) {
      requestNotificationPermissionsAsync();
    } else if (result.granted) {
      scheduleDailyReminder();
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
  if (result.granted) scheduleDailyReminder();
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

export function useNotificationResponseHandler() {
  const router = useRouter();
  const nav = useNavigation();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const { notification } = response;
      if (notification.request.identifier === "right-now") {
      if((nav.getState()?.routes.length ?? 0) === 0) {
        router.replace("/");
      }
        router.push("/log");
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);
}
