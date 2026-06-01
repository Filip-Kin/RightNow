// Glue between the Health facade, the pure sleep mapping, and the entry store.
// Reads recent sleep sessions, maps them to asleep hours, and fills the unlogged
// ones with the configured Sleep activity. Safe to call repeatedly (on toggle,
// on "Sync now", and on app foreground); it's a no-op when disabled.
import { ensureConfig, getConfig } from "./config";
import { isHealthAvailable, hasSleepPermission, requestSleepPermission, readSleepSessions } from "./health";
import { sleepHours } from "./sleepFill";
import { fillHealthSleep } from "./entries";

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_DAYS = 30; // routine (foreground) sync window
// A manual sync backfills the whole history so old nights you missed during manual
// logging get filled too. Far enough back to cover any imported data; Health
// Connect only returns what it actually has, and fill only touches empty hours.
const FULL_HISTORY_START_MS = new Date(2015, 0, 1).getTime();
// Don't hammer Health Connect on every foreground; once an hour is plenty.
const FOREGROUND_MIN_INTERVAL_MS = 60 * 60 * 1000;

let inFlight: Promise<number> | null = null;

export interface HealthSyncResult {
  ok: boolean;
  filled: number;
  // "disabled"/"denied" are sentinels the UI special-cases; anything else is the
  // underlying error message, surfaced so a failure is diagnosable on-device.
  reason?: string;
}

interface SyncOptions {
  // Whether we may show the Health Connect permission UI. Only the explicit
  // Settings actions (toggle / "Sync sleep now") set this; the automatic
  // foreground path NEVER prompts (it only reads if already granted), so a
  // background path can't pop a system dialog or trip the permission flow.
  prompt?: boolean;
  // Backfill the whole history (manual sync) vs. just the recent window (foreground).
  fullHistory?: boolean;
}

/**
 * Run one sleep sync. `now` is injectable for tests. Returns how many hours were
 * filled. Coalesces concurrent calls so a foreground + manual tap don't double-run.
 */
export async function syncHealthSleep(now = Date.now(), opts: SyncOptions = {}): Promise<HealthSyncResult> {
  const wantPrompt = opts.prompt === true;
  const cfg = await ensureConfig();
  if (!cfg.healthSleepEnabled) return { ok: false, filled: 0, reason: "disabled" };
  if (inFlight) {
    const filled = await inFlight;
    return { ok: true, filled };
  }
  const run = (async () => {
    if (!(await isHealthAvailable())) throw new Error("unavailable");
    const granted = wantPrompt ? await requestSleepPermission() : await hasSleepPermission();
    if (!granted) throw new Error("denied");
    const sinceMs = opts.fullHistory ? FULL_HISTORY_START_MS : now - BACKFILL_DAYS * DAY_MS;
    const sessions = await readSleepSessions(sinceMs, now);
    const slots = sleepHours(sessions);
    const filled = await fillHealthSleep(slots, 0); // Sleep is permanently activity index 0
    // eslint-disable-next-line no-console
    console.warn("[health] mapped", slots.length, "sleep hours,", filled, "newly filled;",
      "sample:", JSON.stringify(slots.slice(0, 24)));
    cfg.lastHealthSyncAt = now;
    return filled;
  })();
  inFlight = run;
  try {
    const filled = await run;
    return { ok: true, filled };
  } catch (e) {
    return { ok: false, filled: 0, reason: (e as Error)?.message || "error" };
  } finally {
    inFlight = null;
  }
}

/**
 * Foreground hook: fire-and-forget. Deliberately conservative - it does nothing
 * until a manual sync has already succeeded once (`lastHealthSyncAt > 0`), so the
 * app never touches the Health Connect native layer automatically on startup.
 * That's what guarantees a Health problem can't put the app in a launch crash
 * loop: the risky path only runs after the user has confirmed it works once.
 */
export function maybeSyncHealthOnForeground(now = Date.now()): void {
  const cfg = getConfig();
  if (!cfg?.healthSleepEnabled) return;
  if (!(cfg.lastHealthSyncAt > 0)) return; // never auto-run before a successful manual sync
  if (now - cfg.lastHealthSyncAt < FOREGROUND_MIN_INTERVAL_MS) return;
  void syncHealthSleep(now, { prompt: false });
}
