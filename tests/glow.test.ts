import assert from "node:assert/strict";
import test from "node:test";
import { defaultBloom, glowPulse } from "../lib/tree/glow.ts";

test("bloom defaults conservatively for desktop-class devices", () => {
  assert.equal(defaultBloom(1, 8), true);
  assert.equal(defaultBloom(2, 4), true);
  assert.equal(defaultBloom(3, 8), false);
  assert.equal(defaultBloom(1, 2), false);
});

test("emissive pulse stays gentle and phases differ", () => {
  for (let t = 0; t < 300; t += 0.1) {
    assert.ok(glowPulse(t) >= 0.905 && glowPulse(t) <= 1.095);
  }
  assert.notEqual(glowPulse(1, 0), glowPulse(1, 2.1));
});

// Material updates must stay frozen when the viewer requests reduced motion.
test("reduced motion freezes twinkle uniforms and emissive pulse", async () => {
  const { Scene, Mesh, MeshStandardMaterial, SphereGeometry, InstancedMesh, MeshBasicMaterial } = await import("three");
  const { createGlowAnimation, twinkleBulbs } = await import("../components/tree/glow.ts");
  const scene = new Scene();
  const star = new MeshStandardMaterial({ name: "star-glow" });
  scene.add(new Mesh(new SphereGeometry(), star));
  const bulbs = new InstancedMesh(new SphereGeometry(), new MeshBasicMaterial(), 3);
  twinkleBulbs(bulbs);
  scene.add(bulbs);
  const frozen = createGlowAnimation(scene, true);
  const initial = star.emissiveIntensity;
  frozen.update(10);
  assert.equal(star.emissiveIntensity, initial);
  assert.equal(bulbs.material.userData.glowTime.value, 0);
  const animated = createGlowAnimation(scene, false);
  animated.update(10);
  assert.notEqual(star.emissiveIntensity, initial);
  assert.equal(bulbs.material.userData.glowTime.value, 10);
  assert.equal(bulbs.geometry.getAttribute("glowPhase").count, 3);
});
