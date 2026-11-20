import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, formatMessageCount, hasRhinoHeader, validateInitialsClient, validateModelMetadata } from "../lib/ornaments/client.ts";
import { MAX_MODEL_BYTES } from "../lib/ornaments/types.ts";

test("client name validation accepts full names", () => {
  assert.equal(validateInitialsClient("Jordan Lee"), null);
  assert.equal(validateInitialsClient("A"), null);
  assert.equal(validateInitialsClient("  ")?.field, "initials");
  assert.equal(validateInitialsClient("x".repeat(61))?.field, "initials");
});

test("client model metadata rejects invalid files", () => {
  assert.equal(validateModelMetadata({ name: "star.3dm", size: 32 }), null);
  assert.equal(validateModelMetadata({ name: "star.obj", size: 32 })?.field, "model");
  assert.equal(validateModelMetadata({ name: "star.3dm", size: 0 })?.field, "model");
  assert.equal(validateModelMetadata({ name: "star.3dm", size: MAX_MODEL_BYTES + 1 })?.field, "model");
});

test("client recognizes the Rhino 3DM header", () => {
  assert.equal(hasRhinoHeader(new TextEncoder().encode("3D Geometry File Format       80")), true);
  assert.equal(hasRhinoHeader(new TextEncoder().encode("not really a model")), false);
});

test("byte sizes are concise and readable", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
});

test("optional message counter starts blank and tracks the 80-character limit", () => {
  assert.equal(formatMessageCount(""), "0/80");
  assert.equal(formatMessageCount("x".repeat(80)), "80/80");
});
