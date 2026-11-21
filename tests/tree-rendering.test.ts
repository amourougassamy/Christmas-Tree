import assert from "node:assert/strict";
import test from "node:test";
import {
  Box3,
  BoxGeometry,
  ConeGeometry,
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
  prepareOrnamentModel,
  preserveSupportedMaterials,
} from "../lib/tree/model.ts";
import {
  CONE_SEGMENTS,
  SCENE_UNITS_PER_METRE,
  STANDARD_ORNAMENT_SPAN,
  TREE_TIERS,
} from "../lib/tree/geometry.ts";

const HALF = STANDARD_ORNAMENT_SPAN / 2;

test("tree exposes 60 stable, one-based anchors", () => {
  assert.equal(TREE_ANCHORS.length, 60);
  assert.deepEqual(createTreeAnchors(), TREE_ANCHORS);
  assert.deepEqual(TREE_ANCHORS.map(({ slot }) => slot), Array.from({ length: 60 }, (_, i) => i + 1));
  for (const anchor of TREE_ANCHORS) {
    assert.ok([...anchor.position, ...anchor.tip, anchor.rotationY].every(Number.isFinite));
    assert.equal("scale" in anchor, false, "glb ornaments use one shared scale");
  }
});

test("anchors fill the seven rims, top ring first", () => {
  const ridgeCounts = new Map<number, number>();
  for (const anchor of TREE_ANCHORS) ridgeCounts.set(anchor.tier, (ridgeCounts.get(anchor.tier) ?? 0) + 1);
  assert.deepEqual([...ridgeCounts.keys()], [6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual([...ridgeCounts.values()], [4, 6, 8, 9, 10, 11, 12]);
});

test("each branch tip lies exactly on its cone's polygonal lower rim", () => {
  for (const anchor of TREE_ANCHORS) {
    const tier = TREE_TIERS[anchor.tier];
    const [x, y, z] = anchor.tip;
    assert.ok(Math.abs(y - tier.baseY) < 1e-9);
    // Rebuild the rim from three's own cone vertices and intersect the anchor's ray with it.
    const cone = new ConeGeometry(tier.radius, tier.height, CONE_SEGMENTS);
    cone.rotateY(tier.rotationY);
    const position = cone.getAttribute("position");
    const rim: Vector3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      const vertex = new Vector3().fromBufferAttribute(position, i);
      if (Math.abs(vertex.y + tier.height / 2) < 1e-6 && vertex.length() > tier.height / 2 + 1e-6) rim.push(vertex);
    }
    const angle = Math.atan2(x, z);
    let rimRadius = NaN;
    for (let i = 0; i < CONE_SEGMENTS; i += 1) {
      const a = rim[i];
      const b = rim[i + 1];
      const angleA = Math.atan2(a.x, a.z);
      const span = ((Math.atan2(b.x, b.z) - angleA) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const offset = ((angle - angleA) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (offset > span + 1e-9) continue;
      // Ray (sin, cos) * t meets segment a + (b - a) * s.
      const dx = Math.sin(angle);
      const dz = Math.cos(angle);
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const t = (a.x * ez - a.z * ex) / (dx * ez - dz * ex);
      rimRadius = t;
      break;
    }
    assert.ok(Math.abs(Math.hypot(x, z) - rimRadius) < 1e-6, `slot ${anchor.slot} tip off the rim`);
  }
});

test("eyelets hang just outside and below their branch tip", () => {
  for (const anchor of TREE_ANCHORS) {
    const tipRadius = Math.hypot(anchor.tip[0], anchor.tip[2]);
    const eyeRadius = Math.hypot(anchor.position[0], anchor.position[2]);
    const reach = eyeRadius - tipRadius;
    assert.ok(reach >= 0.02 && reach <= 0.15, `slot ${anchor.slot} reach ${reach}`);
    const drop = anchor.tip[1] - anchor.position[1];
    assert.ok(drop > 0 && drop <= 0.15);
    // Same direction from the trunk as the tip, facing outward.
    assert.ok(Math.abs(Math.atan2(anchor.position[0], anchor.position[2]) - Math.atan2(anchor.tip[0], anchor.tip[2])) < 1e-9);
    const outward = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), anchor.rotationY);
    assert.ok(Math.abs(outward.x - anchor.position[0] / eyeRadius) < 1e-9);
  }
});

test("a 4-inch ornament hung at every anchor clears every cone layer", () => {
  assert.ok(Math.abs(0.1016 * SCENE_UNITS_PER_METRE - 0.72) < 1e-12);
  const steps = 40;
  for (const anchor of TREE_ANCHORS) {
    const [ex, ey, ez] = anchor.position;
    const radial = Math.hypot(ex, ez);
    const direction = [ex / radial, ez / radial];
    // The worst case 4" cube hangs centred under the eyelet, facing outward.
    for (const [index, tier] of TREE_TIERS.entries()) {
      for (let i = 0; i <= steps; i += 1) {
        const y = ey - (STANDARD_ORNAMENT_SPAN * i) / steps;
        if (y < tier.baseY || y > tier.baseY + tier.height) continue;
        // Circumscribed (vertex) radius of the cone at this height: conservative.
        const coneRadius = (tier.radius * (tier.baseY + tier.height - y)) / tier.height;
        for (const [u, v] of [[-HALF, -HALF], [-HALF, 0], [-HALF, HALF], [0, -HALF], [0, HALF], [HALF, -HALF], [HALF, HALF]]) {
          // u: radial offset, v: tangential offset.
          const px = ex + direction[0] * u + direction[1] * v;
          const pz = ez + direction[1] * u - direction[0] * v;
          assert.ok(
            Math.hypot(px, pz) > coneRadius,
            `slot ${anchor.slot} ornament enters cone ${index} at y=${y.toFixed(3)}`,
          );
        }
      }
    }
  }
});

test("neighbouring 4-inch ornaments on a ring don't touch", () => {
  for (const anchor of TREE_ANCHORS) {
    for (const other of TREE_ANCHORS) {
      if (other.slot <= anchor.slot || other.tier !== anchor.tier) continue;
      const gap = Math.hypot(anchor.position[0] - other.position[0], anchor.position[2] - other.position[2]);
      assert.ok(gap > STANDARD_ORNAMENT_SPAN * Math.SQRT2, `slots ${anchor.slot}/${other.slot}`);
    }
  }
});

test("glb ornaments keep their eyelet origin and the one true scale", () => {
  const root = new Group();
  // A 4" bauble hanging below its eyelet, authored in metres.
  const mesh = new Mesh(new BoxGeometry(0.1016, 0.1016, 0.1016).translate(0, -0.0508, 0), new MeshStandardMaterial());
  mesh.castShadow = true;
  root.add(mesh);
  prepareOrnamentModel(root, SCENE_UNITS_PER_METRE);
  const box = new Box3().setFromObject(root);
  assert.ok(Math.abs(box.max.y) < 1e-6, "eyelet stays at the origin");
  assert.ok(Math.abs(box.max.x - box.min.x - 0.72) < 1e-5);
  assert.equal(mesh.castShadow, false);

  const small = new Group();
  small.add(new Mesh(new BoxGeometry(0.0254, 0.0254, 0.0254), new MeshStandardMaterial()));
  prepareOrnamentModel(small, SCENE_UNITS_PER_METRE);
  const smallBox = new Box3().setFromObject(small);
  assert.ok(Math.abs(smallBox.max.x - smallBox.min.x - 0.18) < 1e-5, "a 1-inch ornament stays a quarter size");
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
  assert.ok(isSupportedMaterial(second.material as unknown as MeshBasicMaterial));
  assert.notEqual(second.material, custom);
});

test("ornament callouts show participant text only when supplied", () => {
  assert.equal(formatOrnamentCallout("Happy holidays", "AM1"), "Happy holidays — AM1");
  assert.equal(formatOrnamentCallout("", "AM1"), "AM1");
});
