import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import type { DatabaseSync } from "node:sqlite";
import type { ModelStore, NewOrnament, OrnamentRecord, OrnamentRepository, StoredModel } from "./types.ts";
import { SLOT_COUNT } from "./types.ts";

type Row = Record<string, unknown>;

function fromRow(row: Row): OrnamentRecord {
  return {
    id: String(row.id),
    initials: String(row.initials),
    message: String(row.message ?? ""),
    slot: Number(row.slot),
    objectKey: String(row.object_key),
    originalName: String(row.original_name),
    byteSize: Number(row.byte_size),
    previewKey: String(row.preview_key),
    previewByteSize: Number(row.preview_byte_size),
    createdAt: String(row.created_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  };
}

export class SqliteOrnamentRepository implements OrnamentRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** Round-robin 1..SLOT_COUNT; the allocator row stores the slot handed out next. */
  async claimNextSlot(): Promise<number> {
    const row = this.db.prepare(`
      INSERT INTO ornament_allocator (id, next_slot) VALUES (1, 2)
      ON CONFLICT(id) DO UPDATE SET
        next_slot = CASE WHEN next_slot >= ${SLOT_COUNT} THEN 1 ELSE next_slot + 1 END
      RETURNING CASE WHEN next_slot = 1 THEN ${SLOT_COUNT} ELSE next_slot - 1 END AS slot
    `).get() as Row | undefined;
    if (!row) throw new Error("Ornament allocator did not return a slot.");
    return Number(row.slot);
  }

  async archiveActiveAndInsert(record: NewOrnament): Promise<void> {
    this.transaction(() => {
      this.db.prepare(`
        UPDATE ornaments SET archived_at = ?
        WHERE slot = ? AND archived_at IS NULL AND deleted_at IS NULL
      `).run(record.createdAt, record.slot);
      this.db.prepare(`
        INSERT INTO ornaments
          (id, initials, message, slot, object_key, original_name, byte_size,
           preview_key, preview_byte_size, created_at, archived_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `).run(
        record.id,
        record.initials,
        record.message,
        record.slot,
        record.objectKey,
        record.originalName,
        record.byteSize,
        record.previewKey,
        record.previewByteSize,
        record.createdAt,
      );
    });
  }

  async list(includeArchived: boolean): Promise<OrnamentRecord[]> {
    const condition = includeArchived
      ? "deleted_at IS NULL"
      : "deleted_at IS NULL AND archived_at IS NULL";
    const rows = this.db.prepare(`
      SELECT * FROM ornaments WHERE ${condition}
      ORDER BY slot ASC, created_at DESC
    `).all() as Row[];
    return rows.map(fromRow);
  }

  async find(id: string): Promise<OrnamentRecord | null> {
    return this.findSync(id);
  }

  async deleteAndRestore(id: string, deletedAt: string): Promise<OrnamentRecord | null> {
    return this.transaction(() => {
      const target = this.findSync(id);
      if (!target) return null;
      this.db.prepare("UPDATE ornaments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .run(deletedAt, id);
      if (target.archivedAt === null) {
        this.db.prepare(`
          UPDATE ornaments SET archived_at = NULL
          WHERE id = (
            SELECT id FROM ornaments
            WHERE slot = ? AND archived_at IS NOT NULL AND deleted_at IS NULL AND id <> ?
            ORDER BY created_at DESC, rowid DESC LIMIT 1
          )
        `).run(target.slot, id);
      }
      return target;
    });
  }

  private findSync(id: string): OrnamentRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM ornaments WHERE id = ? AND deleted_at IS NULL",
    ).get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  /** Runs `fn` in one write transaction. node:sqlite is synchronous, so nothing interleaves. */
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Stores model files under `root` (normally `${DATA_DIR}/models`), keyed by relative paths such as `ornaments/<id>.3dm`. */
export class FileModelStore implements ModelStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = normalize(root);
  }

  async put(key: string, bytes: ArrayBuffer, metadata: Record<string, string>): Promise<void> {
    void metadata; // Metadata lives in SQLite; the file holds only the bytes.
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, new Uint8Array(bytes), { flag: "wx" });
      await rename(temp, path);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<StoredModel | null> {
    const path = this.pathFor(key);
    let info;
    try {
      info = await stat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (!info.isFile()) return null;
    const etag = createHash("sha256")
      .update(`${key}\0${info.size}\0${info.mtimeMs}`)
      .digest("base64url")
      .slice(0, 27);
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return { body, size: info.size, etag: `"${etag}"` };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** Resolves a storage key to a path inside `root`, rejecting traversal and absolute keys. */
  private pathFor(key: string): string {
    if (
      typeof key !== "string" ||
      key.length === 0 ||
      key.includes("\0") ||
      key.includes("..") ||
      isAbsolute(key) ||
      /^[a-zA-Z]:/.test(key) ||
      key.split(/[\\/]/).some((part) => part === "" || part === ".")
    ) {
      throw new Error(`Invalid model storage key: ${JSON.stringify(key)}`);
    }
    const path = join(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Invalid model storage key: ${JSON.stringify(key)}`);
    }
    return path;
  }
}
