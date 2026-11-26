import assert from "node:assert/strict";
import test from "node:test";
import { EMISSIVE_LEVEL, glowPulse, haloOpacity } from "../lib/tree/glow.ts";

test("emissive pulse stays gentle and phases differ", () => {
  for (let t = 0; t < 300; t += 0.1) {
    assert.ok(glowPulse(t) >= 0.905 && glowPulse(t) <= 1.095);
  }
  assert.notEqual(glowPulse(1, 0), glowPulse(1, 2.1));
});

test("halos are faint by day, softly stronger at night, and clamped", () => {
  assert.ok(haloOpacity(0) < haloOpacity(1));
  assert.ok(haloOpacity(1) <= 0.5, "halos must stay subtle even at night");
  assert.equal(haloOpacity(-1), haloOpacity(0));
  assert.equal(haloOpacity(2), haloOpacity(1));
});

test("star and lantern stay near their pre-bloom levels", () => {
  assert.ok(EMISSIVE_LEVEL["star-glow"] < 1);
  assert.ok(EMISSIVE_LEVEL["lantern-flame"] < 2);
});

// Material updates must stay frozen when the viewer requests reduced motion.
test("reduced motion freezes the emissive pulse", async () => {
  const { Scene, Mesh, MeshStandardMaterial, SphereGeometry } = await import("three");
  const { createGlowAnimation } = await import("../components/tree/glow.ts");
  const scene = new Scene();
  const star = new MeshStandardMaterial({ name: "star-glow" });
  scene.add(new Mesh(new SphereGeometry(), star));
  const frozen = createGlowAnimation(scene, true);
  const initial = star.emissiveIntensity;
  assert.equal(initial, EMISSIVE_LEVEL["star-glow"] * glowPulse(0, 0));
  frozen.update(10);
  assert.equal(star.emissiveIntensity, initial);
  createGlowAnimation(scene, false).update(10);
  assert.notEqual(star.emissiveIntensity, initial);
});
