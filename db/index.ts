import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Directory that holds `tree.db` and `models/`. Override with `DATA_DIR`. */
export function dataDir(): string {
  // Runtime data, not source: keep Turbopack from tracing it into the build.
  return resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "./data");
}

export interface OpenDatabaseOptions {
  /** Directory for `tree.db`. Defaults to `dataDir()`. */
  dir?: string;
  /** Directory holding drizzle-kit output (`*.sql` + `meta/_journal.json`). Defaults to `./drizzle`. */
  migrationsDir?: string;
}

interface Journal {
  entries: { idx: number; tag: string }[];
}

/**
 * Opens `<dir>/tree.db` with WAL and foreign keys on, then applies any
 * drizzle migrations not yet recorded in `__migrations`.
 */
export function openDatabase(options: OpenDatabaseOptions = {}): DatabaseSync {
  const dir = options.dir ?? dataDir();
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "tree.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db, options.migrationsDir ?? resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle"));
  return db;
}

/** Applies migrations in journal order; returns the tags it applied. */
export function migrate(db: DatabaseSync, migrationsDir: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
    tag TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const journal = JSON.parse(
    readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  const isApplied = db.prepare("SELECT 1 FROM __migrations WHERE tag = ?");
  const record = db.prepare("INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)");
  const applied: string[] = [];

  for (const { tag } of entries) {
    if (isApplied.get(tag)) continue;
    const sql = readFileSync(join(migrationsDir, `${tag}.sql`), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of statements) db.exec(statement);
      record.run(tag, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${tag} failed: ${(error as Error).message}`, { cause: error });
    }
    console.log(`[db] applied migration ${tag}`);
    applied.push(tag);
  }
  return applied;
}

let shared: DatabaseSync | undefined;

/** The process-wide database at `${DATA_DIR}/tree.db`, opened and migrated on first use. */
export function getDatabase(): DatabaseSync {
  shared ??= openDatabase();
  return shared;
}
