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
} from "react-native-health-connect";
import type { SleepSession } from "./sleepFill";

export type { SleepSession };

const SLEEP_PERM = { accessType: "read", recordType: "SleepSession" } as const;

let initialized = false;
async function ensureInit(): Promise<boolean> {
  if (initialized) return true;
  try {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    initialized = await initialize();
    return initialized;
  } catch {
    return false;
  }
}

export async function isHealthAvailable(): Promise<boolean> {
  try {
    return (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

function hasSleepRead(perms: { accessType: string; recordType: string }[]): boolean {
  return perms.some((p) => p.accessType === "read" && p.recordType === "SleepSession");
}

export async function requestSleepPermission(): Promise<boolean> {
  if (!(await ensureInit())) return false;
  try {
    const granted = await getGrantedPermissions();
    if (hasSleepRead(granted)) return true;
    const result = await requestPermission([SLEEP_PERM]);
    return hasSleepRead(result);
  } catch {
    return false;
  }
}

export async function readSleepSessions(
  sinceMs: number,
  untilMs: number,
): Promise<SleepSession[]> {
  if (!(await ensureInit())) return [];
  try {
    const { records } = await readRecords("SleepSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: new Date(sinceMs).toISOString(),
        endTime: new Date(untilMs).toISOString(),
      },
    });
    return records
      .map((r) => ({ start: Date.parse(r.startTime), end: Date.parse(r.endTime) }))
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  } catch {
    return [];
  }
}
