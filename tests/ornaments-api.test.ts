import assert from "node:assert/strict";
import test from "node:test";
import { deleteResponse, listResponse, modelResponse, uploadResponse } from "../lib/ornaments/http.ts";
import { OrnamentService } from "../lib/ornaments/service.ts";
import { MAX_MODEL_BYTES, SLOT_COUNT } from "../lib/ornaments/types.ts";
import type { ModelStore, OrnamentRecord, OrnamentRepository, StoredModel } from "../lib/ornaments/types.ts";

class MemoryRepository implements OrnamentRepository {
  records: OrnamentRecord[] = [];
  nextSlot = 1;

  async claimNextSlot() {
    const slot = this.nextSlot;
    this.nextSlot = this.nextSlot === SLOT_COUNT ? 1 : this.nextSlot + 1;
    return slot;
  }

  async archiveActiveAndInsert(record: OrnamentRecord) {
    for (const item of this.records) {
      if (item.slot === record.slot && item.archivedAt === null && item.deletedAt === null) {
        item.archivedAt = record.createdAt;
      }
    }
    this.records.push(record);
  }

  async list(includeArchived: boolean) {
    return this.records
      .filter((item) => item.deletedAt === null && (includeArchived || item.archivedAt === null))
      .sort((a, b) => a.slot - b.slot || b.createdAt.localeCompare(a.createdAt));
  }

  async find(id: string) {
    return this.records.find((item) => item.id === id && item.deletedAt === null) ?? null;
  }

  async deleteAndRestore(id: string, deletedAt: string) {
    const target = await this.find(id);
    if (!target) return null;
    target.deletedAt = deletedAt;
    if (target.archivedAt === null) {
      const replacement = this.records
        .filter((item) => item.slot === target.slot && item.archivedAt !== null && item.deletedAt === null)
        .at(-1);
      if (replacement) replacement.archivedAt = null;
    }
    return target;
  }
}

class MemoryStore implements ModelStore {
  objects = new Map<string, Uint8Array>();

  async put(key: string, bytes: ArrayBuffer) {
    this.objects.set(key, new Uint8Array(bytes));
  }

  async get(key: string): Promise<StoredModel | null> {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      size: bytes.byteLength,
      etag: `"${bytes.byteLength}"`,
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function fixture() {
  const repository = new MemoryRepository();
  const store = new MemoryStore();
  let id = 0;
  let second = 0;
  const service = new OrnamentService(
    repository,
    store,
    () => new Date(Date.UTC(2026, 10, 19, 0, 0, second++)),
    () => `ornament-${++id}`,
  );
  return { repository, store, service };
}

const VALID_RHINO_BYTES = new TextEncoder().encode("3D Geometry File Format       80 fixture");

function uploadRequest(initials: string, name = "star.3dm", bytes = VALID_RHINO_BYTES, message = "") {
  const form = new FormData();
  form.set("initials", initials);
  form.set("message", message);
  form.set("model", new File([bytes], name));
  return new Request("https://tree.test/api/ornaments", { method: "POST", body: form });
}

test("public upload, list, and model stream contract", async () => {
  const { service } = fixture();
  const created = await uploadResponse(uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "  Happy holidays  "), service);
  assert.equal(created.status, 201);
  const payload = await created.json() as { ornament: { id: string; slot: number; message: string; modelUrl: string } };
  assert.equal(payload.ornament.slot, 1);
  assert.equal(payload.ornament.message, "Happy holidays");
  assert.equal(payload.ornament.modelUrl, "/api/ornaments/ornament-1/model");

  const listed = await listResponse(new Request("https://tree.test/api/ornaments"), service);
  assert.equal(listed.status, 200);
  assert.equal(((await listed.json()) as { ornaments: unknown[] }).ornaments.length, 1);

  const model = await modelResponse(payload.ornament.id, service);
  assert.equal(model.status, 200);
  assert.equal(model.headers.get("content-length"), String(VALID_RHINO_BYTES.length));
  assert.deepEqual(new Uint8Array(await model.arrayBuffer()), VALID_RHINO_BYTES);
});

test("60-slot allocator archives the displaced record and delete restores it", async () => {
  const { service } = fixture();
  for (let index = 0; index <= SLOT_COUNT; index += 1) {
    const response = await uploadResponse(uploadRequest("X", `model-${index}.3dm`), service);
    assert.equal(response.status, 201);
  }

  const active = await service.list();
  assert.equal(active.length, SLOT_COUNT);
  const currentSlotOne = active.find((item) => item.slot === 1);
  assert.equal(currentSlotOne?.id, "ornament-61");

  const all = await service.list(true);
  const archivedSlotOne = all.find((item) => item.slot === 1 && item.archivedAt !== null);
  assert.equal(archivedSlotOne?.id, "ornament-1");

  const deleted = await deleteResponse("ornament-61", service);
  assert.equal(deleted.status, 204);
  const restored = (await service.list()).find((item) => item.slot === 1);
  assert.equal(restored?.id, "ornament-1");
  assert.equal(restored?.archivedAt, null);
});

test("upload validation enforces name, extension, and 20 MiB limit", async () => {
  const cases = [
    [uploadRequest(" "), 400, "INVALID_INITIALS"],
    [uploadRequest("x".repeat(61)), 400, "INVALID_INITIALS"],
    [uploadRequest("AB", "star.obj"), 415, "INVALID_MODEL_TYPE"],
    [uploadRequest("AB", "star.3dm", new Uint8Array(MAX_MODEL_BYTES + 1)), 413, "MODEL_TOO_LARGE"],
    [uploadRequest("AB", "star.3dm", new Uint8Array([1]), "x".repeat(81)), 400, "INVALID_MESSAGE"],
    [uploadRequest("AB", "fake.3dm", new TextEncoder().encode("not a Rhino file")), 415, "INVALID_MODEL_CONTENT"],
  ] as const;

  for (const [request, status, code] of cases) {
    const { service } = fixture();
    const response = await uploadResponse(request, service);
    assert.equal(response.status, status);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, code);
  }
});

test("missing records return the stable JSON error envelope", async () => {
  const { service } = fixture();
  const response = await deleteResponse("missing", service);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "NOT_FOUND", message: "Ornament not found." },
  });
});
