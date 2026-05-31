// Android Health Connect implementation of the health facade. Reads SleepSession
// records read-only; we never write to Health Connect. Resolved by Metro for
// Android only (web/iOS get health.ts).
import {
  initialize,
  getSdkStatus,
  SdkAvailabilityStatus,
  requestPermission,
  getGrantedPermissions,
  readRecords,
  openHealthConnectSettings,
} from "react-native-health-connect";
import type { SleepSession } from "./sleepFill";

export type { SleepSession };

const SLEEP_PERM = { accessType: "read", recordType: "SleepSession" } as const;
// Tagged so it's greppable in logcat (ReactNativeJS) while debugging on-device.
const log = (...a: unknown[]) => console.warn("[health]", ...a);

let initialized = false;
// Establishes the native HealthConnectClient. Throws a descriptive error (which
// the caller surfaces) rather than failing silently, so a stuck permission flow
// is diagnosable instead of just "the toggle flips off".
async function ensureInit(): Promise<void> {
  if (initialized) return;
  const status = await getSdkStatus();
  log("getSdkStatus =", status, "(SDK_AVAILABLE =", SdkAvailabilityStatus.SDK_AVAILABLE, ")");
  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    throw new Error(`Health Connect not available (status ${status})`);
  }
  initialized = await initialize();
  log("initialize ->", initialized);
  if (!initialized) throw new Error("Health Connect failed to initialize");
}

export async function isHealthAvailable(): Promise<boolean> {
  try {
    const s = await getSdkStatus();
    log("isHealthAvailable: status", s);
    return s === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch (e) {
    log("isHealthAvailable error", String(e));
    return false;
  }
}

function hasSleepRead(perms: { accessType: string; recordType: string }[]): boolean {
  return perms.some((p) => p.accessType === "read" && p.recordType === "SleepSession");
}

export async function hasSleepPermission(): Promise<boolean> {
  try {
    await ensureInit();
    const granted = await getGrantedPermissions();
    return hasSleepRead(granted);
  } catch (e) {
    log("hasSleepPermission error", String(e));
    return false;
  }
}

// Throws on failure (init error, request error) so the caller can show the real
// reason. Returns false only when the request completed but sleep wasn't granted.
export async function requestSleepPermission(): Promise<boolean> {
  await ensureInit();
  const granted = await getGrantedPermissions();
  log("granted before request:", JSON.stringify(granted));
  if (hasSleepRead(granted)) return true;
  const result = await requestPermission([SLEEP_PERM]);
  log("requestPermission result:", JSON.stringify(result));
  return hasSleepRead(result);
}

/** Open the system Health Connect screen so the user can grant access manually. */
export async function openHealthSettings(): Promise<void> {
  try {
    openHealthConnectSettings();
  } catch (e) {
    log("openHealthSettings error", String(e));
  }
}

export async function readSleepSessions(
  sinceMs: number,
  untilMs: number,
): Promise<SleepSession[]> {
  await ensureInit();
  const { records } = await readRecords("SleepSession", {
    timeRangeFilter: {
      operator: "between",
      startTime: new Date(sinceMs).toISOString(),
      endTime: new Date(untilMs).toISOString(),
    },
  });
  log("readSleepSessions:", records.length, "sessions");
  return records
    .map((r) => ({ start: Date.parse(r.startTime), end: Date.parse(r.endTime) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
}
