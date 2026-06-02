// Durable backing store for the decrypted entries/notes, on expo-sqlite (native +
// web). Replaces the old "one giant AsyncStorage key" persistence, which blew past
// Android's 2MB CursorWindow read limit (SQLiteBlobTooBigException) once an account
// had thousands of cells, so the store silently loaded empty -> history "cleared".
//
// entries.ts keeps the decrypted maps in memory for fast reads; this module is just
// the row-per-cell persistence: load everything on start, flush changed rows on write.
import * as SQLite from "expo-sqlite";

export interface DbEntry {
  cellId: string;
  date: string;
  hour: number;
  activity: number | null;
  feeling: number | null;
  source: string;
  updatedAt: number;
  deleted: boolean;
}
export interface DbNote {
  date: string;
  text: string;
  updatedAt: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("rightnow.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS entries (
          cell_id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL,
          hour INTEGER NOT NULL,
          activity INTEGER,
          feeling INTEGER,
          source TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS notes (
          date TEXT PRIMARY KEY NOT NULL,
          text TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

interface EntryRow { cell_id: string; date: string; hour: number; activity: number | null; feeling: number | null; source: string; updated_at: number; deleted: number }
interface NoteRow { date: string; text: string; updated_at: number }

/** Read the entire store into memory (called once on start). */
export async function dbLoadAll(): Promise<{ entries: DbEntry[]; notes: DbNote[]; cursor: number; cursorId: string }> {
  const db = await getDb();
  const erows = await db.getAllAsync<EntryRow>(
    "SELECT cell_id, date, hour, activity, feeling, source, updated_at, deleted FROM entries",
  );
  const nrows = await db.getAllAsync<NoteRow>("SELECT date, text, updated_at FROM notes");
  const cur = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'cursor'");
  const curId = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'cursorId'");
  return {
    entries: erows.map((r) => ({
      cellId: r.cell_id, date: r.date, hour: r.hour, activity: r.activity,
      feeling: r.feeling, source: r.source, updatedAt: r.updated_at, deleted: !!r.deleted,
    })),
    notes: nrows.map((r) => ({ date: r.date, text: r.text, updatedAt: r.updated_at })),
    cursor: cur ? Number(cur.value) : 0,
    cursorId: curId?.value ?? "",
  };
}

// Multi-row upsert chunk size. Each entry binds 8 params, so 100 rows = 800 params,
// comfortably under SQLite's variable limit. Batching turns ~1500 awaited single-row
// INSERTs (a native round-trip each) into ~15 statements - the bulk-download speedup.
const FLUSH_CHUNK = 100;

/** Flush a batch of changes in one transaction. */
export async function dbFlush(opts: {
  entries?: DbEntry[];
  notes?: DbNote[];
  deleteNotes?: string[];
  cursor?: number | null;
  cursorId?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const entries = opts.entries ?? [];
    for (let i = 0; i < entries.length; i += FLUSH_CHUNK) {
      const slice = entries.slice(i, i + FLUSH_CHUNK);
      const placeholders = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const params: (string | number | null)[] = [];
      for (const e of slice) {
        params.push(e.cellId, e.date, e.hour, e.activity, e.feeling, e.source, e.updatedAt, e.deleted ? 1 : 0);
      }
      await db.runAsync(
        `INSERT INTO entries (cell_id, date, hour, activity, feeling, source, updated_at, deleted)
         VALUES ${placeholders}
         ON CONFLICT(cell_id) DO UPDATE SET
           date=excluded.date, hour=excluded.hour, activity=excluded.activity,
           feeling=excluded.feeling, source=excluded.source,
           updated_at=excluded.updated_at, deleted=excluded.deleted`,
        params,
      );
    }
    for (const n of opts.notes ?? []) {
      await db.runAsync(
        `INSERT INTO notes (date, text, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at`,
        [n.date, n.text, n.updatedAt],
      );
    }
    for (const date of opts.deleteNotes ?? []) {
      await db.runAsync("DELETE FROM notes WHERE date = ?", [date]);
    }
    if (opts.cursor != null) {
      await db.runAsync(
        "INSERT INTO meta (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [String(opts.cursor)],
      );
    }
    if (opts.cursorId != null) {
      await db.runAsync(
        "INSERT INTO meta (key, value) VALUES ('cursorId', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [opts.cursorId],
      );
    }
  });
}

/** Wipe everything (logout / account switch). */
export async function dbClearAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync("DELETE FROM entries; DELETE FROM notes; DELETE FROM meta;");
}
