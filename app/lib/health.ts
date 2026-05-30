// Platform-agnostic Health facade. Metro resolves `health.android.ts` on Android
// (real Health Connect) and this file everywhere else (web + iOS), so the native
// module is never imported where it can't load. iOS/HealthKit is a later pass.
import type { SleepSession } from "./sleepFill";

export type { SleepSession };

/** Whether a usable Health provider exists on this device. */
export async function isHealthAvailable(): Promise<boolean> {
  return false;
}

/** Whether sleep read access is already granted (never shows UI). */
export async function hasSleepPermission(): Promise<boolean> {
  return false;
}

/** Prompt for read access to sleep data. Resolves true if granted. */
export async function requestSleepPermission(): Promise<boolean> {
  return false;
}

/** Read sleep sessions overlapping [sinceMs, untilMs]. */
export async function readSleepSessions(
  _sinceMs: number,
  _untilMs: number,
): Promise<SleepSession[]> {
  return [];
}
