import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBytes,
  formatCount,
  formatInches,
  formatMessageCount,
  hasGlbHeader,
  validateInitialsClient,
  validateModelMetadata,
} from "../lib/ornaments/client.ts";
import { MAX_MODEL_BYTES } from "../lib/ornaments/types.ts";

test("client name validation accepts full names", () => {
  assert.equal(validateInitialsClient("Jordan Lee"), null);
  assert.equal(validateInitialsClient("A"), null);
  assert.equal(validateInitialsClient("  ")?.field, "initials");
  assert.equal(validateInitialsClient("x".repeat(61))?.field, "initials");
});

test("client model metadata rejects invalid files", () => {
  assert.equal(validateModelMetadata({ name: "star.glb", size: 32 }), null);
  assert.equal(validateModelMetadata({ name: "star.3dm", size: 32 })?.field, "model");
  assert.equal(validateModelMetadata({ name: "star.obj", size: 32 })?.field, "model");
  assert.equal(validateModelMetadata({ name: "star.glb", size: 0 })?.field, "model");
  assert.equal(validateModelMetadata({ name: "star.glb", size: MAX_MODEL_BYTES + 1 })?.field, "model");
});

test("client recognizes GLB 2.0 and rejects Rhino or truncated files", () => {
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  assert.equal(hasGlbHeader(header), true);
  assert.equal(hasGlbHeader(header.slice(0, 4)), false);
  view.setUint32(4, 1, true);
  assert.equal(hasGlbHeader(header), false);
  assert.equal(hasGlbHeader(new TextEncoder().encode("3D Geometry File Format")), false);
});

test("byte sizes are concise and readable", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
});

test("wish counter counts words across spaces and line breaks", () => {
  assert.equal(formatMessageCount(""), "0/20 words");
  assert.equal(formatMessageCount("  Happy   holidays!\nFrom all of us.  "), "6/20 words");
});


test("conversion report values are readable", () => {
  assert.equal(formatInches([3, 3.224, 0.391]), "3.00 × 3.22 × 0.39 in");
  assert.equal(formatCount(200000), "200,000");
});
