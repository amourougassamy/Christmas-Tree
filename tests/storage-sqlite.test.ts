import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { migrate, openDatabase } from "../db/index.ts";
import { FileModelStore, SqliteOrnamentRepository } from "../lib/ornaments/repository.ts";
import { SLOT_COUNT } from "../lib/ornaments/types.ts";
import type { OrnamentRecord } from "../lib/ornaments/types.ts";

const migrationsDir = resolve(import.meta.dirname, "..", "drizzle");

function tempDir(t: test.TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "tree-storage-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function setup(t: test.TestContext) {
  const dir = tempDir(t);
  const db = openDatabase({ dir, migrationsDir });
  t.after(() => db.close());
  return { dir, db, repo: new SqliteOrnamentRepository(db) };
}

let clock = Date.UTC(2026, 11, 1);
function record(id: string, slot: number): OrnamentRecord {
  clock += 1000;
  return {
    id,
    initials: `Name ${id}`,
    message: "",
    slot,
    objectKey: `ornaments/${id}.3dm`,
    originalName: `${id}.3dm`,
    byteSize: 100,
    previewKey: `ornaments/${id}.glb`,
    previewByteSize: 50,
    createdAt: new Date(clock).toISOString(),
    archivedAt: null,
    deletedAt: null,
  };
}

async function upload(repo: SqliteOrnamentRepository, id: string) {
  const slot = await repo.claimNextSlot();
  const rec = record(id, slot);
  await repo.archiveActiveAndInsert(rec);
  return rec;
}

test("opens with WAL + foreign keys and migrations are idempotent", (t) => {
  const { dir, db } = setup(t);
  assert.ok(existsSync(join(dir, "tree.db")));
  assert.equal((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
  assert.equal((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  assert.deepEqual(migrate(db, migrationsDir), []);
  const again = openDatabase({ dir, migrationsDir });
  t.after(() => again.close());
  const tags = again.prepare("SELECT tag FROM __migrations").all() as { tag: string }[];
  assert.deepEqual(tags.map((row) => row.tag), ["0000_late_whizzer"]);
});

test("slots are claimed round-robin and wrap past 60", async (t) => {
  const { repo } = setup(t);
  const slots: number[] = [];
  for (let i = 0; i < SLOT_COUNT + 3; i++) slots.push(await repo.claimNextSlot());
  assert.deepEqual(slots.slice(0, 3), [1, 2, 3]);
  assert.equal(slots[SLOT_COUNT - 1], 60);
  assert.deepEqual(slots.slice(SLOT_COUNT), [1, 2, 3]);
});

test("reclaiming a slot archives its active ornament and round-trips preview columns", async (t) => {
  const { repo } = setup(t);
  const first: OrnamentRecord[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) first.push(await upload(repo, `a${i}`));
  const replacement = await upload(repo, "b0");
  assert.equal(replacement.slot, 1);

  const active = await repo.list(false);
  assert.equal(active.length, SLOT_COUNT);
  assert.deepEqual(active[0], replacement);

  const archived = await repo.find("a0");
  assert.equal(archived?.archivedAt, replacement.createdAt);
  assert.equal(archived?.previewKey, "ornaments/a0.glb");
  assert.equal(archived?.previewByteSize, 50);

  const all = await repo.list(true);
  assert.equal(all.length, SLOT_COUNT + 1);
  assert.deepEqual(all.slice(0, 2).map((item) => item.id), ["b0", "a0"]);
});

test("deleting the active ornament restores the newest archived one", async (t) => {
  const { repo } = setup(t);
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < SLOT_COUNT; i++) await upload(repo, `r${round}-${i}`);
  }
  // Slot 1 holds r2-0 (active), r1-0 and r0-0 (archived).
  const deleted = await repo.deleteAndRestore("r2-0", new Date().toISOString());
  assert.equal(deleted?.id, "r2-0");
  assert.equal(deleted?.archivedAt, null);
  assert.equal(await repo.find("r2-0"), null);
  assert.equal((await repo.find("r1-0"))?.archivedAt, null);
  assert.notEqual((await repo.find("r0-0"))?.archivedAt, null);
  assert.equal((await repo.list(false)).find((item) => item.slot === 1)?.id, "r1-0");

  assert.equal(await repo.deleteAndRestore("r2-0", new Date().toISOString()), null);
  assert.equal(await repo.deleteAndRestore("missing", new Date().toISOString()), null);
});

test("deleting an archived ornament leaves the active one alone", async (t) => {
  const { repo } = setup(t);
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < SLOT_COUNT; i++) await upload(repo, `r${round}-${i}`);
  }
  const deleted = await repo.deleteAndRestore("r1-0", new Date().toISOString());
  assert.equal(deleted?.id, "r1-0");
  assert.equal((await repo.find("r2-0"))?.archivedAt, null);
  assert.notEqual((await repo.find("r0-0"))?.archivedAt, null);
  const slotOne = (await repo.list(true)).filter((item) => item.slot === 1).map((item) => item.id);
  assert.deepEqual(slotOne, ["r2-0", "r0-0"]);
});

test("FileModelStore puts, streams, and deletes files", async (t) => {
  const root = join(tempDir(t), "models");
  const store = new FileModelStore(root);
  const bytes = new TextEncoder().encode("3D Geometry File Format hello");
  await store.put("ornaments/x.3dm", bytes.buffer, { id: "x" });
  assert.ok(existsSync(join(root, "ornaments", "x.3dm")));

  const stored = await store.get("ornaments/x.3dm");
  assert.ok(stored);
  assert.equal(stored.size, bytes.byteLength);
  assert.match(stored.etag ?? "", /^"[^"]+"$/);
  const read = new Uint8Array(await new Response(stored.body).arrayBuffer());
  assert.deepEqual(read, bytes);

  const again = await store.get("ornaments/x.3dm");
  assert.equal(again?.etag, stored.etag);
  await again?.body.cancel();

  await store.delete("ornaments/x.3dm");
  assert.equal(await store.get("ornaments/x.3dm"), null);
  await store.delete("ornaments/x.3dm");
  assert.equal(await store.get("ornaments/never.glb"), null);
});

test("FileModelStore rejects traversal and absolute keys", async (t) => {
  const store = new FileModelStore(join(tempDir(t), "models"));
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  for (const key of ["../escape.3dm", "ornaments/../../x", "/etc/passwd", "a/..", "", "ornaments//x"]) {
    await assert.rejects(store.put(key, bytes, {}), /Invalid model storage key/, key);
    await assert.rejects(store.get(key), /Invalid model storage key/, key);
    await assert.rejects(store.delete(key), /Invalid model storage key/, key);
  }
});
