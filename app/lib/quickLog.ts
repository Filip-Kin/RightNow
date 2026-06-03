// Quick-log bridge between the native draw-over overlay (and, later, the Wear OS
// app) and the encrypted entry store.
//
// The overlay/watch can't touch our E2EE data, so the contract is two plaintext
// files in the app's private document dir (Paths.document === Android
// context.filesDir, so native Kotlin and JS read/write the same paths):
//
//   quicklog-taxonomy.json  - JS writes it; native reads it to draw the grid.
//   quicklog-queue.json     - native appends taps; JS drains + clears it.
//
// A tap is recorded plaintext only briefly: the headless JS drain task (registered
// in index.js, woken by the native HeadlessJsTaskService and by the periodic
// background-fetch safety net) reads the DEK from SecureStore, encrypts each
// pending answer via importEntries, pushes to the server, then clears the queue.
import { File, Paths } from "expo-file-system";
import { NativeModules } from "react-native";
import { getActivities, subscribeTaxonomy } from "./activities";
import { importEntries, push } from "./entries";
import { reloadFilled, trimFilled } from "./filledHours";

// Phone->watch taxonomy mirror (no-op when the native module / Wear bridge is absent).
const QuickLog: { pushTaxonomy(json: string): Promise<boolean> } | undefined = NativeModules.QuickLog;

export const TAXONOMY_FILE = "quicklog-taxonomy.json";
export const QUEUE_FILE = "quicklog-queue.json";

// One queued answer the overlay/watch wrote. activity/feeling are taxonomy indices
// (feeling null when not chosen / skip-feeling activity).
export interface PendingAnswer {
  date: string; // "YYYY-M-D" (local)
  hour: number; // 0-23
  activity: number | null;
  feeling: number | null;
  ts: number; // epoch ms the tap happened (for logging/debug)
}

interface TaxonomyMirror {
  version: 1;
  updatedAt: number;
  activities: { index: number; name: string; color: string; icon: string; skipFeeling?: boolean }[];
}

async function readJson<T>(name: string): Promise<T | null> {
  try {
    const f = new File(Paths.document, name);
    if (!f.exists) return null;
    const raw = await f.text();
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(name: string, value: unknown): void {
  const f = new File(Paths.document, name);
  if (!f.exists) f.create();
  f.write(JSON.stringify(value));
}

/** Write the plaintext taxonomy mirror the native overlay renders from. */
export function writeTaxonomyMirror(): void {
  const mirror: TaxonomyMirror = {
    version: 1,
    updatedAt: Date.now(),
    activities: getActivities().map((a) => ({
      index: a.index, name: a.name, color: a.color, icon: a.icon, skipFeeling: a.skipFeeling,
    })),
  };
  try {
    writeJson(TAXONOMY_FILE, mirror);
    // Mirror to the watch too so its activity grid stays in sync.
    void QuickLog?.pushTaxonomy(JSON.stringify(mirror));
  } catch {
    /* best-effort; overlay falls back to an empty grid until next write */
  }
}

// Keep the mirror fresh whenever the user edits activities. Call startTaxonomyMirror()
// once at app start; it also writes an initial copy.
let mirrorStarted = false;
export function startTaxonomyMirror(): void {
  if (mirrorStarted) return;
  mirrorStarted = true;
  writeTaxonomyMirror();
  subscribeTaxonomy(() => writeTaxonomyMirror());
}

let draining = false;

/**
 * Drain the native quick-log queue: encrypt each pending answer into the store and
 * push it. Safe to call from anywhere (foreground, headless task, background-fetch);
 * coalesces concurrent calls and never throws. Returns how many answers were synced.
 * Requires an unlocked session (DEK) - if locked, leaves the queue for next time.
 */
export async function drainQuickLogQueue(): Promise<number> {
  if (draining) return 0;
  draining = true;
  try {
    // Pick up any filled-hours the native overlay (separate process) recorded while we
    // were away, so our in-memory ledger isn't stale before importEntries unions in.
    await reloadFilled();
    const queue = await readJson<PendingAnswer[]>(QUEUE_FILE);
    if (!queue || queue.length === 0) {
      trimFilled();
      return 0;
    }
    const consumed = queue.length;

    // importEntries throws if locked (no DEK) - keep the queue and bail. It also marks
    // each answered hour in the shared filled-ledger.
    await importEntries(queue.map((q) => ({ date: q.date, hour: q.hour, activity: q.activity, feeling: q.feeling })));
    await push();
    trimFilled(); // keep the ledger bounded to the last ~25h

    // Only drop the entries we consumed; anything the overlay appended while we were
    // draining stays queued for the next drain.
    const after = (await readJson<PendingAnswer[]>(QUEUE_FILE)) ?? [];
    writeJson(QUEUE_FILE, after.slice(consumed));
    return consumed;
  } catch {
    // Locked or offline: leave the queue intact for the next drain.
    return 0;
  } finally {
    draining = false;
  }
}
