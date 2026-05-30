// Glue between the Health facade, the pure sleep mapping, and the entry store.
// Reads recent sleep sessions, maps them to asleep hours, and fills the unlogged
// ones with the configured Sleep activity. Safe to call repeatedly (on toggle,
// on "Sync now", and on app foreground); it's a no-op when disabled.
import { ensureConfig, getConfig } from "./config";
import { isHealthAvailable, requestSleepPermission, readSleepSessions } from "./health";
import { sleepHours } from "./sleepFill";
import { fillHealthSleep } from "./entries";

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_DAYS = 30; // how far back a sync reads
// Don't hammer Health Connect on every foreground; once an hour is plenty.
const FOREGROUND_MIN_INTERVAL_MS = 60 * 60 * 1000;

let inFlight: Promise<number> | null = null;

export interface HealthSyncResult {
  ok: boolean;
  filled: number;
  reason?: "disabled" | "unavailable" | "denied" | "error";
}

/**
 * Run one sleep sync. `now` is injectable for tests. Returns how many hours were
 * filled. Coalesces concurrent calls so a foreground + manual tap don't double-run.
 */
export async function syncHealthSleep(now = Date.now()): Promise<HealthSyncResult> {
  const cfg = await ensureConfig();
  if (!cfg.healthSleepEnabled) return { ok: false, filled: 0, reason: "disabled" };
  if (inFlight) {
    const filled = await inFlight;
    return { ok: true, filled };
  }
  const run = (async () => {
    if (!(await isHealthAvailable())) throw new Error("unavailable");
    if (!(await requestSleepPermission())) throw new Error("denied");
    const sessions = await readSleepSessions(now - BACKFILL_DAYS * DAY_MS, now);
    const slots = sleepHours(sessions);
    const filled = await fillHealthSleep(slots, cfg.sleepActivityIndex);
    cfg.lastHealthSyncAt = now;
    return filled;
  })();
  inFlight = run;
  try {
    const filled = await run;
    return { ok: true, filled };
  } catch (e) {
    const reason = (e as Error)?.message;
    return { ok: false, filled: 0, reason: reason === "unavailable" || reason === "denied" ? reason : "error" };
  } finally {
    inFlight = null;
  }
}

/** Foreground hook: sync if enabled and the last read is stale. Fire-and-forget. */
export function maybeSyncHealthOnForeground(now = Date.now()): void {
  const cfg = getConfig();
  if (!cfg?.healthSleepEnabled) return;
  if (now - (cfg.lastHealthSyncAt ?? 0) < FOREGROUND_MIN_INTERVAL_MS) return;
  void syncHealthSleep(now);
}
