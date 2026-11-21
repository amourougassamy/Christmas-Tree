import assert from "node:assert/strict";
import test from "node:test";
import { createLoadQueue } from "../lib/tree/load-queue.ts";
import { fitDistance, projectExtents, sweepRings } from "../lib/tree/framing.ts";
import {
  beginDrag,
  createSpinState,
  dragBy,
  endDrag,
  IDLE_RESUME_DELAY,
  IDLE_SPIN_SPEED,
  nudge,
  stepSpin,
} from "../lib/tree/spin.ts";

test("drag spins, release coasts and decays, idle spin resumes later", () => {
  const spin = createSpinState(0);
  beginDrag(spin);
  for (let i = 0; i < 5; i += 1) dragBy(spin, 20, 1 / 60);
  assert.ok(spin.angle > 0.5);
  assert.equal(stepSpin(spin, 1 / 60, true), false, "no stepping while dragging");
  endDrag(spin, 10);
  const releaseVelocity = spin.velocity;
  assert.ok(releaseVelocity > 1);
  stepSpin(spin, 0.5, true);
  assert.ok(spin.velocity < releaseVelocity && spin.velocity > 0, "inertia decays");
  for (let t = 0; t < IDLE_RESUME_DELAY + 3; t += 1 / 60) stepSpin(spin, 1 / 60, true);
  assert.ok(Math.abs(spin.velocity - IDLE_SPIN_SPEED) < 0.01, "settles into the idle spin");
});

test("reduced motion: inertia stops and there is no idle spin", () => {
  const spin = createSpinState(1);
  nudge(spin, -1);
  for (let t = 0; t < 10; t += 1 / 60) stepSpin(spin, 1 / 60, false);
  assert.equal(spin.velocity, 0);
  const angle = spin.angle;
  assert.equal(stepSpin(spin, 1, false), false);
  assert.equal(spin.angle, angle);
  assert.ok(angle < 1, "left arrow turns the other way");
});

test("holding still before release doesn't fling", () => {
  const spin = createSpinState();
  beginDrag(spin);
  dragBy(spin, 40, 1 / 60);
  endDrag(spin, 300);
  assert.equal(spin.velocity, 0);
});

test("load queue honours concurrency and starts the highest priority first", async () => {
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  let running = 0;
  let peak = 0;
  const priority: Record<string, number> = { a: 1, b: 5, c: 3, d: 4, e: 2 };
  const queue = createLoadQueue<string>({
    concurrency: 2,
    priority: (job) => priority[job],
    load: (job, signal) =>
      new Promise<void>((resolve) => {
        started.push(job);
        running += 1;
        peak = Math.max(peak, running);
        const done = () => {
          running -= 1;
          resolve();
        };
        releases.set(job, done);
        signal.addEventListener("abort", done);
      }),
  });
  for (const job of ["a", "b", "c", "d", "e"]) queue.add(job, job);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ["b", "d"]);
  queue.cancel("c");
  releases.get("b")!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ["b", "d", "e"]);
  queue.dispose();
  assert.equal(peak, 2);
  assert.equal(queue.pending + queue.active, 0);
});

test("framing fits the swept silhouette inside the requested fraction", () => {
  const points = sweepRings([[4.5, -4.5], [4.5, 0], [0.3, 7]]);
  const options = { fovY: Math.PI / 6, aspect: 390 / 844, targetY: 1.25, elevation: 0.08, maxHeightFraction: 0.7, maxWidthFraction: 0.86 };
  const distance = fitDistance(points, options);
  const extents = projectExtents(points, distance, options);
  assert.ok(Math.max(-extents.minX, extents.maxX) <= 0.86 + 1e-6);
  assert.ok(Math.max(-extents.minX, extents.maxX) > 0.85, "phone framing is width-limited");
  assert.ok(Math.max(-extents.minY, extents.maxY) <= 0.7 + 1e-6);
});
