import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOSEUP_IDLE_RESUME_DELAY,
  CLOSEUP_PITCH_LIMIT,
  closeupBeginDrag,
  closeupCameraDistance,
  closeupDragBy,
  closeupEndDrag,
  createCloseupRotation,
  stepCloseupRotation,
} from "../lib/tree/closeup.ts";

test("drag clamps pitch even for a huge fling", () => {
  const rotation = createCloseupRotation();
  closeupBeginDrag(rotation);
  closeupDragBy(rotation, 0, 100_000, 0.01);
  assert.equal(rotation.pitch, CLOSEUP_PITCH_LIMIT);
  assert.ok(rotation.pitchVelocity <= 9);
});

test("holding still before release cancels both fling axes", () => {
  const rotation = createCloseupRotation();
  closeupBeginDrag(rotation);
  closeupDragBy(rotation, 100, 50, 0.02);
  assert.notEqual(rotation.yawVelocity, 0);
  assert.notEqual(rotation.pitchVelocity, 0);
  closeupEndDrag(rotation, 81);
  assert.equal(rotation.yawVelocity, 0);
  assert.equal(rotation.pitchVelocity, 0);
});

test("fling decays, then idle spin observes its delay and motion preference", () => {
  const fling = createCloseupRotation();
  closeupBeginDrag(fling);
  closeupDragBy(fling, 120, 30, 0.02);
  closeupEndDrag(fling, 0);
  for (let index = 0; index < 300; index += 1) stepCloseupRotation(fling, 1 / 60, false);
  assert.equal(fling.yawVelocity, 0);
  assert.equal(fling.pitchVelocity, 0);

  const idle = createCloseupRotation();
  idle.idleFor = 0;
  assert.equal(stepCloseupRotation(idle, CLOSEUP_IDLE_RESUME_DELAY - 0.01, true), false);
  assert.equal(idle.yawVelocity, 0);
  assert.equal(stepCloseupRotation(idle, 0.02, true), true);
  assert.ok(idle.yawVelocity > 0);

  const reducedMotion = createCloseupRotation();
  reducedMotion.idleFor = 0;
  assert.equal(stepCloseupRotation(reducedMotion, CLOSEUP_IDLE_RESUME_DELAY + 1, false), false);
  assert.equal(reducedMotion.yawVelocity, 0);
});

test("stepping does nothing while dragging", () => {
  const rotation = createCloseupRotation();
  closeupBeginDrag(rotation);
  rotation.yawVelocity = 2;
  rotation.pitchVelocity = -1;
  const snapshot = { ...rotation };
  assert.equal(stepCloseupRotation(rotation, 1, true), false);
  assert.deepEqual(rotation, snapshot);
});

test("camera distance scales with radius and keeps the ornament within the requested fraction", () => {
  const fov = Math.PI / 6;
  const aspect = 0.75;
  const maxFraction = 0.62;
  const small = closeupCameraDistance(1, fov, aspect, maxFraction);
  const large = closeupCameraDistance(2, fov, aspect, maxFraction);
  assert.ok(large > small);

  const radius = 1.4;
  const distance = closeupCameraDistance(radius, fov, aspect, maxFraction);
  const verticalFit = radius / Math.tan(fov / 2);
  assert.ok(distance >= verticalFit);
  const usableDistance = distance - radius * 0.4;
  const verticalFraction = radius / (Math.tan(fov / 2) * usableDistance);
  const horizontalFraction = radius / (Math.tan(fov / 2) * aspect * usableDistance);
  assert.ok(verticalFraction <= maxFraction);
  assert.ok(horizontalFraction <= maxFraction);
});
