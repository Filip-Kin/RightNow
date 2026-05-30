// Full off-platform backup: one combined JSON document with the whole account -
// the activity taxonomy + every entry (all years) + every day note. Distinct from
// the per-year WAYDRN CSV import/export (lib/csv.ts), which is the spreadsheet
// migrator. This is a lossless backup/restore, e.g. to migrate to a new account.
//
// Pure (no store/RN imports) so it's unit-testable; the screen wires it to the
// live store (getAllEntries / getNotes / getActivities -> serialize; parse ->
// setActivities / importEntries / importNotes).
import type { LocalEntry } from "./entries";
import type { ActivityDef } from "./activities";

export const BACKUP_SCHEMA = "rightnow-backup";
export const BACKUP_VERSION = 1;

export interface BackupEntry {
  date: string; // "YYYY-M-D"
  hour: number; // 0-23
  activity: number | null;
  feeling: number | null;
  source: "manual" | "health";
}

export interface BackupNote {
  date: string;
  note: string;
}

export interface BackupFile {
  schema: typeof BACKUP_SCHEMA;
  version: number;
  exportedAt: string; // ISO timestamp
  activities: ActivityDef[];
  entries: BackupEntry[];
  notes: BackupNote[];
}

/** Build the backup document from the decrypted store's contents. */
export function serializeBackup(
  activities: ActivityDef[],
  entries: LocalEntry[],
  notes: Record<string, string>,
  exportedAt: string,
): string {
  const file: BackupFile = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt,
    activities,
    entries: entries.map((e) => ({
      date: e.date, hour: e.hour, activity: e.activity, feeling: e.feeling, source: e.source,
    })),
    notes: Object.entries(notes).map(([date, note]) => ({ date, note })),
  };
  return JSON.stringify(file, null, 2);
}

export interface ParsedBackup {
  activities: ActivityDef[];
  entries: BackupEntry[];
  notes: BackupNote[];
}

/** Parse + validate a backup file. Throws a friendly message on anything off. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const f = data as Partial<BackupFile>;
  if (!f || f.schema !== BACKUP_SCHEMA) {
    throw new Error("Not a RightNow backup file (use 'Import data' for spreadsheet CSVs).");
  }
  if (typeof f.version !== "number" || f.version > BACKUP_VERSION) {
    throw new Error("This backup was made by a newer version of the app.");
  }
  const activities = Array.isArray(f.activities) ? f.activities : [];
  const entriesRaw = Array.isArray(f.entries) ? f.entries : [];
  const notesRaw = Array.isArray(f.notes) ? f.notes : [];

  const entries: BackupEntry[] = [];
  for (const e of entriesRaw) {
    if (!e || typeof e.date !== "string" || typeof e.hour !== "number") continue;
    entries.push({
      date: e.date,
      hour: e.hour,
      activity: typeof e.activity === "number" ? e.activity : null,
      feeling: typeof e.feeling === "number" ? e.feeling : null,
      source: e.source === "health" ? "health" : "manual",
    });
  }
  const notes: BackupNote[] = [];
  for (const n of notesRaw) {
    if (n && typeof n.date === "string" && typeof n.note === "string" && n.note) {
      notes.push({ date: n.date, note: n.note });
    }
  }
  return { activities, entries, notes };
}

/** A filename for a backup download, e.g. rightnow-backup-2026-05-30.json. */
export function backupFilename(isoDate: string): string {
  return `rightnow-backup-${isoDate.slice(0, 10)}.json`;
}
