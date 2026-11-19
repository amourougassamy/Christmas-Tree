import assert from "node:assert/strict";
import test from "node:test";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
} from "three";
import { createTreeAnchors, TREE_ANCHORS } from "../lib/tree/anchors.ts";
import {
  formatOrnamentCallout,
  isSupportedMaterial,
  normalizeVisibleGeometry,
  preserveSupportedMaterials,
} from "../lib/tree/model.ts";

test("tree exposes 60 stable, one-based anchors inside the crown envelope", () => {
  assert.equal(TREE_ANCHORS.length, 60);
  assert.deepEqual(createTreeAnchors(), TREE_ANCHORS);
  assert.deepEqual(TREE_ANCHORS.map(({ slot }) => slot), Array.from({ length: 60 }, (_, i) => i + 1));
  for (const anchor of TREE_ANCHORS) {
    assert.ok(anchor.position.every(Number.isFinite));
    assert.ok(anchor.position[1] <= 3.45 && anchor.position[1] >= -3);
    assert.ok(Math.hypot(anchor.position[0], anchor.position[2]) <= 3.08);
  }
});

test("normalization centers visible geometry and scales its diameter", () => {
  const source = new Group();
  const mesh = new Mesh(new BoxGeometry(4, 2, 2), new MeshStandardMaterial());
  mesh.position.set(12, -3, 5);
  source.add(mesh);
  const result = normalizeVisibleGeometry(source, 1);
  assert.ok(result);
  assert.ok(Math.abs(result.scale - 1 / Math.sqrt(24)) < 1e-8);
  assert.equal(result.group.children[0], source);
});

test("supported materials survive while custom shaders receive a fallback", () => {
  const supported = new MeshStandardMaterial();
  const custom = new ShaderMaterial();
  const root = new Group();
  const first = new Mesh(new BoxGeometry(), supported);
  const second = new Mesh(new BoxGeometry(), custom);
  root.add(first, second);
  preserveSupportedMaterials(root, new MeshBasicMaterial({ color: "#d4a849" }));
  assert.equal(first.material, supported);
  assert.ok(isSupportedMaterial(second.material as MeshBasicMaterial));
  assert.notEqual(second.material, custom);
});

test("ornament callouts show participant text only when supplied", () => {
  assert.equal(formatOrnamentCallout("Happy holidays", "AM1"), "Happy holidays — AM1");
  assert.equal(formatOrnamentCallout("", "AM1"), "AM1");
});