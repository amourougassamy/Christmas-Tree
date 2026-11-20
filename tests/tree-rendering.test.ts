import assert from "node:assert/strict";
import test from "node:test";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from "three";
import { createTreeAnchors, TREE_ANCHORS } from "../lib/tree/anchors.ts";
import {
  formatOrnamentCallout,
  isSupportedMaterial,
  normalizeVisibleGeometry,
  orientRhinoModel,
  preserveSupportedMaterials,
} from "../lib/tree/model.ts";

test("tree exposes 60 stable, one-based anchors inside the crown envelope", () => {
  assert.equal(TREE_ANCHORS.length, 60);
  assert.deepEqual(createTreeAnchors(), TREE_ANCHORS);
  assert.deepEqual(TREE_ANCHORS.map(({ slot }) => slot), Array.from({ length: 60 }, (_, i) => i + 1));
  for (const anchor of TREE_ANCHORS) {
    assert.ok(anchor.position.every(Number.isFinite));
    assert.ok(anchor.position[1] <= 2.08 && anchor.position[1] >= -3.51);
    assert.ok(Math.hypot(anchor.position[0], anchor.position[2]) <= 3.63);
  }
});

test("anchors sit on the seven evergreen ridge rings", () => {
  const ridgeCounts = new Map<number, number>();
  for (const anchor of TREE_ANCHORS) {
    const y = Number(anchor.position[1].toFixed(3));
    ridgeCounts.set(y, (ridgeCounts.get(y) ?? 0) + 1);
  }
  assert.deepEqual([...ridgeCounts.values()], [4, 6, 8, 9, 10, 11, 12]);
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
  source.updateMatrixWorld(true);
  mesh.geometry.computeBoundingBox();
  const normalizedBox = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
  assert.ok(Math.abs(normalizedBox.max.y) < 1e-8);
});

test("Rhino Z-up is converted to Three.js Y-up", () => {
  const source = new Group();
  orientRhinoModel(source);
  const transformed = new Vector3(0, 0, 1).applyQuaternion(source.quaternion);
  assert.ok(transformed.distanceTo(new Vector3(0, 1, 0)) < 1e-8);
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
