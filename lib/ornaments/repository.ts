import type { ModelStore, NewOrnament, OrnamentRecord, OrnamentRepository, StoredModel } from "./types.ts";

type Row = Record<string, unknown>;

function fromRow(row: Row): OrnamentRecord {
  return {
    id: String(row.id),
    initials: String(row.initials),
    slot: Number(row.slot),
    objectKey: String(row.object_key),
    originalName: String(row.original_name),
    byteSize: Number(row.byte_size),
    createdAt: String(row.created_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  };
}

export class D1OrnamentRepository implements OrnamentRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async claimNextSlot(): Promise<number> {
    const row = await this.db.prepare(`
      INSERT INTO ornament_allocator (id, next_slot) VALUES (1, 2)
      ON CONFLICT(id) DO UPDATE SET
        next_slot = CASE WHEN next_slot >= 60 THEN 1 ELSE next_slot + 1 END
      RETURNING CASE WHEN next_slot = 1 THEN 60 ELSE next_slot - 1 END AS slot
    `).first<Row>();
    if (!row) throw new Error("Ornament allocator did not return a slot.");
    return Number(row.slot);
  }

  async archiveActiveAndInsert(record: NewOrnament): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        UPDATE ornaments SET archived_at = ?
        WHERE slot = ? AND archived_at IS NULL AND deleted_at IS NULL
      `).bind(record.createdAt, record.slot),
      this.db.prepare(`
        INSERT INTO ornaments
          (id, initials, slot, object_key, original_name, byte_size, created_at, archived_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `).bind(
        record.id,
        record.initials,
        record.slot,
        record.objectKey,
        record.originalName,
        record.byteSize,
        record.createdAt,
      ),
    ]);
  }

  async list(includeArchived: boolean): Promise<OrnamentRecord[]> {
    const condition = includeArchived
      ? "deleted_at IS NULL"
      : "deleted_at IS NULL AND archived_at IS NULL";
    const result = await this.db.prepare(`
      SELECT * FROM ornaments WHERE ${condition}
      ORDER BY slot ASC, created_at DESC
    `).all<Row>();
    return result.results.map(fromRow);
  }

  async find(id: string): Promise<OrnamentRecord | null> {
    const row = await this.db.prepare(
      "SELECT * FROM ornaments WHERE id = ? AND deleted_at IS NULL",
    ).bind(id).first<Row>();
    return row ? fromRow(row) : null;
  }

  async deleteAndRestore(id: string, deletedAt: string): Promise<OrnamentRecord | null> {
    const target = await this.find(id);
    if (!target) return null;

    const statements = [
      this.db.prepare("UPDATE ornaments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(deletedAt, id),
    ];
    if (target.archivedAt === null) {
      statements.push(this.db.prepare(`
        UPDATE ornaments SET archived_at = NULL
        WHERE id = (
          SELECT id FROM ornaments
          WHERE slot = ? AND archived_at IS NOT NULL AND deleted_at IS NULL AND id <> ?
          ORDER BY created_at DESC, rowid DESC LIMIT 1
        )
      `).bind(target.slot, id));
    }
    await this.db.batch(statements);
    return target;
  }
}

export class R2ModelStore implements ModelStore {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async put(key: string, bytes: ArrayBuffer, metadata: Record<string, string>): Promise<void> {
    await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: metadata,
    });
  }

  async get(key: string): Promise<StoredModel | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return { body: object.body, size: object.size, etag: object.httpEtag };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
