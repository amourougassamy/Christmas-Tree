import assert from "node:assert/strict";
import test from "node:test";
import { deleteResponse, listResponse, modelResponse, sourceResponse, uploadResponse } from "../lib/ornaments/http.ts";
import { OrnamentService } from "../lib/ornaments/service.ts";
import { MAX_MODEL_BYTES, MAX_PREVIEW_BYTES, SLOT_COUNT } from "../lib/ornaments/types.ts";
import type { ModelStore, OrnamentRecord, OrnamentRepository, StoredModel } from "../lib/ornaments/types.ts";
import { rawGlb } from "./convert-helpers.ts";

class MemoryRepository implements OrnamentRepository {
  records: OrnamentRecord[] = [];
  nextSlot = 1;
  claims = 0;
  failInsert = false;

  async claimNextSlot() {
    this.claims += 1;
    const slot = this.nextSlot;
    this.nextSlot = this.nextSlot === SLOT_COUNT ? 1 : this.nextSlot + 1;
    return slot;
  }

  async archiveActiveAndInsert(record: OrnamentRecord) {
    if (this.failInsert) throw new Error("database unavailable");
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
const VALID_GLB = await rawGlb();

function uploadRequest(
  initials: string,
  name = "star.3dm",
  bytes: Uint8Array = VALID_RHINO_BYTES,
  message = "",
  preview: Uint8Array | null = VALID_GLB,
) {
  const form = new FormData();
  form.set("initials", initials);
  form.set("message", message);
  form.set("model", new File([new Uint8Array(bytes)], name));
  if (preview) form.set("preview", new File([new Uint8Array(preview)], name.replace(/\.3dm$/i, ".glb")));
  return new Request("https://tree.test/api/ornaments", { method: "POST", body: form });
}

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

test("public upload, list, preview, and source stream contract", async () => {
  const { service, store } = fixture();
  const created = await uploadResponse(uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "  Happy holidays  "), service);
  assert.equal(created.status, 201);
  const payload = await created.json() as {
    ornament: { id: string; slot: number; message: string; modelUrl: string; sourceUrl: string; byteSize: number; previewByteSize: number };
  };
  assert.equal(payload.ornament.slot, 1);
  assert.equal(payload.ornament.message, "Happy holidays");
  assert.equal(payload.ornament.modelUrl, "/api/ornaments/ornament-1/model");
  assert.equal(payload.ornament.sourceUrl, "/api/ornaments/ornament-1/source");
  assert.equal(payload.ornament.byteSize, VALID_RHINO_BYTES.length);
  assert.equal(payload.ornament.previewByteSize, VALID_GLB.length);
  assert.deepEqual([...store.objects.keys()].sort(), ["ornaments/ornament-1.3dm", "ornaments/ornament-1.glb"]);
  assert.ok(!("objectKey" in payload.ornament) && !("previewKey" in payload.ornament));

  const listed = await listResponse(new Request("https://tree.test/api/ornaments"), service);
  assert.equal(listed.status, 200);
  assert.equal(((await listed.json()) as { ornaments: unknown[] }).ornaments.length, 1);

  const model = await modelResponse(payload.ornament.id, service);
  assert.equal(model.status, 200);
  assert.equal(model.headers.get("content-type"), "model/gltf-binary");
  assert.equal(model.headers.get("content-length"), String(VALID_GLB.length));
  assert.equal(model.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(model.headers.get("etag"), `"${VALID_GLB.length}"`);
  assert.deepEqual(new Uint8Array(await model.arrayBuffer()), VALID_GLB);

  const source = await sourceResponse(payload.ornament.id, service);
  assert.equal(source.status, 200);
  assert.equal(source.headers.get("content-type"), "application/octet-stream");
  assert.equal(source.headers.get("content-disposition"), 'inline; filename="star.3dm"');
  assert.equal(source.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(source.headers.get("content-length"), String(VALID_RHINO_BYTES.length));
  assert.deepEqual(new Uint8Array(await source.arrayBuffer()), VALID_RHINO_BYTES);

  assert.equal((await deleteResponse(payload.ornament.id, service)).status, 204);
  assert.equal(store.objects.size, 0);
  assert.equal(await errorCode(await modelResponse(payload.ornament.id, service)), "NOT_FOUND");
  assert.equal(await errorCode(await sourceResponse(payload.ornament.id, service)), "NOT_FOUND");
});

test("missing stored files return MODEL_NOT_FOUND", async () => {
  const { service, store } = fixture();
  await uploadResponse(uploadRequest("AB"), service);
  store.objects.clear();
  for (const response of [await modelResponse("ornament-1", service), await sourceResponse("ornament-1", service)]) {
    assert.equal(response.status, 404);
    assert.equal(await errorCode(response), "MODEL_NOT_FOUND");
  }
});

test("a database failure removes both stored files", async () => {
  const { service, store, repository } = fixture();
  repository.failInsert = true;
  const response = await uploadResponse(uploadRequest("AB"), service);
  assert.equal(response.status, 500);
  assert.equal(store.objects.size, 0);
  assert.equal(repository.records.length, 0);
});

test("preview problems are rejected before a slot is claimed", async () => {
  const cases = [
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", null), 400, "PREVIEW_REQUIRED"],
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", new Uint8Array(0)), 400, "PREVIEW_REQUIRED"],
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", VALID_RHINO_BYTES), 415, "INVALID_PREVIEW"],
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", new Uint8Array(MAX_PREVIEW_BYTES + 1)), 413, "PREVIEW_TOO_LARGE"],
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", await rawGlb({ triangles: 20_000 })), 413, "PREVIEW_TOO_LARGE"],
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", await rawGlb({ texture: true })), 422, "PREVIEW_HAS_TEXTURES"],
    [uploadRequest("AB", "star.3dm", VALID_RHINO_BYTES, "", await rawGlb({ sizeMetres: 0.1524 })), 422, "ORNAMENT_TOO_BIG"],
  ] as const;
  for (const [request, status, code] of cases) {
    const { service, repository, store } = fixture();
    const response = await uploadResponse(request, service);
    assert.equal(response.status, status, code);
    assert.equal(await errorCode(response), code);
    assert.equal(repository.claims, 0, `${code} claimed a slot`);
    assert.equal(store.objects.size, 0);
  }
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

test("errors from another bundle's ApiError copy keep their status and code", async () => {
  // Next.js can load lib/ornaments/validation.ts more than once, so the HTTP layer
  // must not depend on `instanceof` to recognise API errors.
  class ForeignApiError extends Error {
    readonly status = 415;
    readonly code = "INVALID_PREVIEW";
    constructor() {
      super("The preview is not a glTF binary (.glb).");
      this.name = "ApiError";
    }
  }
  const failing = { upload: async () => { throw new ForeignApiError(); } } as unknown as OrnamentService;
  const request = new Request("http://test/api/ornaments", { method: "POST", body: new FormData() });
  const response = await uploadResponse(request, failing);
  assert.equal(response.status, 415);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "INVALID_PREVIEW");
});
