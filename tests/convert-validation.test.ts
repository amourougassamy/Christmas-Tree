import assert from "node:assert/strict";
import test from "node:test";
import { Primitive } from "@gltf-transform/core";
import { validatePreview } from "../lib/ornaments/preview-validation.ts";
import { ApiError } from "../lib/ornaments/validation.ts";
import { MAX_PREVIEW_BYTES } from "../lib/ornaments/types.ts";
import { rawGlb } from "./convert-helpers.ts";

async function rejectsWith(bytes: Uint8Array, status: number, code: string, message?: RegExp) {
  await assert.rejects(validatePreview(bytes), (error: unknown) => {
    assert.ok(error instanceof ApiError, String(error));
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    if (message) assert.match(error.message, message);
    return true;
  });
}

test("a small hand-built glb passes", async () => {
  const stats = await validatePreview(await rawGlb());
  assert.equal(stats.triangles, 12);
  assert.equal(stats.materials, 1);
});

test("non-GLB bytes are rejected", async () => {
  await rejectsWith(new TextEncoder().encode("3D Geometry File Format       80 not a glb"), 415, "INVALID_PREVIEW");
  await rejectsWith(new Uint8Array(0), 415, "INVALID_PREVIEW");
  const truncated = (await rawGlb()).slice(0, 40);
  await rejectsWith(truncated, 415, "INVALID_PREVIEW");
});

test("textures are rejected", async () => {
  await rejectsWith(await rawGlb({ texture: true }), 422, "PREVIEW_HAS_TEXTURES");
});

test("20k triangles are over budget", async () => {
  await rejectsWith(await rawGlb({ triangles: 20_000 }), 413, "PREVIEW_TOO_LARGE", /20,000 triangles/);
});

test("too many materials are over budget", async () => {
  await rejectsWith(await rawGlb({ materials: 5, triangles: 50 }), 413, "PREVIEW_TOO_LARGE", /materials/);
});

test("a 6-inch glb is too big, reported in inches", async () => {
  await rejectsWith(await rawGlb({ sizeMetres: 6 * 0.0254 }), 422, "ORNAMENT_TOO_BIG", /6\.00 × 6\.00 × 6\.00 in/);
});

test("a 4-inch glb fits within the tolerance", async () => {
  const stats = await validatePreview(await rawGlb({ sizeMetres: 4 * 0.0254 }));
  assert.ok(stats.sizeMetres.every((side) => Math.abs(side - 0.1016) < 1e-6));
});

test("lines and points are rejected", async () => {
  await rejectsWith(await rawGlb({ mode: Primitive.Mode.LINES, triangles: 2 }), 415, "INVALID_PREVIEW", /triangle/);
  await rejectsWith(await rawGlb({ mode: Primitive.Mode.POINTS, triangles: 2 }), 415, "INVALID_PREVIEW", /triangle/);
});

test("unsupported extensions are rejected", async () => {
  await rejectsWith(await rawGlb({ extensionsUsed: ["KHR_draco_mesh_compression"] }), 415, "INVALID_PREVIEW", /KHR_draco/);
});

test("oversize bytes are rejected before parsing", async () => {
  await rejectsWith(new Uint8Array(MAX_PREVIEW_BYTES + 1), 413, "PREVIEW_TOO_LARGE");
});
