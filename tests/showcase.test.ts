import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOWCASE_LOAD_GRACE_SECONDS,
  advanceShowcase,
  armShowcaseHold,
  cycleIndex,
  parseShowcaseParams,
  startShowcase,
  stepShowcase,
  type ShowcasePhase,
} from "../lib/tree/showcase.ts";
import { turntableYaw } from "../lib/tree/closeup.ts";

const timing = { spinSeconds: 120, holdSeconds: 15 };

test("a full loop: spin, every ornament in order, spin again", () => {
  let phase: ShowcasePhase = startShowcase(0, timing);
  assert.deepEqual(phase, { kind: "spin", endsAt: 120_000 });
  const ids = ["a", "b", "c"];
  const seen: string[] = [];
  let now = phase.endsAt;
  phase = advanceShowcase(phase, now, ids, timing);
  while (phase.kind === "closeup") {
    seen.push(phase.queue[phase.index]);
    assert.equal(phase.armed, false);
    assert.equal(phase.endsAt, now + (15 + SHOWCASE_LOAD_GRACE_SECONDS) * 1000);
    now += 500; // model loads
    phase = armShowcaseHold(phase, now, timing);
    assert.equal(phase.endsAt, now + 15_000);
    now = phase.endsAt;
    phase = advanceShowcase(phase, now, ids, timing);
  }
  assert.deepEqual(seen, ids);
  assert.deepEqual(phase, { kind: "spin", endsAt: now + 120_000 });
});

test("arming only starts the hold clock once", () => {
  const phase = advanceShowcase(startShowcase(0, timing), 0, ["a"], timing);
  const armed = armShowcaseHold(phase, 1000, timing);
  assert.equal(armShowcaseHold(armed, 5000, timing), armed);
});

test("an empty tree just keeps spinning", () => {
  assert.deepEqual(advanceShowcase(startShowcase(0, timing), 120_000, [], timing), { kind: "spin", endsAt: 240_000 });
});

test("ornaments removed mid-round are skipped, new ones wait for the next round", () => {
  const phase = advanceShowcase(startShowcase(0, timing), 0, ["a", "b", "c"], timing);
  const next = advanceShowcase(phase, 1, ["a", "c", "d"], timing);
  assert.equal(next.kind === "closeup" && next.queue[next.index], "c");
  assert.equal(advanceShowcase(next, 2, ["a", "c", "d"], timing).kind, "spin");
});

test("arrow keys wrap around the round and wait for the new model", () => {
  const phase = advanceShowcase(startShowcase(0, timing), 0, ["a", "b", "c"], timing);
  const back = stepShowcase(armShowcaseHold(phase, 0, timing), 10, -1, timing);
  assert.equal(back.kind === "closeup" && back.index, 2);
  assert.equal(back.kind === "closeup" && back.armed, false);
  assert.equal(cycleIndex(2, 1, 3), 0);
  assert.equal(cycleIndex(0, 1, 0), 0);
  const spin = startShowcase(0, timing);
  assert.equal(stepShowcase(spin, 5, 1, timing), spin);
});

test("turntable makes exactly one full turn over the hold, then stops", () => {
  assert.equal(turntableYaw(0.5, 0, 15), 0.5);
  assert.ok(Math.abs(turntableYaw(0.5, 7.5, 15) - (0.5 + Math.PI)) < 1e-9);
  assert.ok(Math.abs(turntableYaw(0.5, 15, 15) - (0.5 + Math.PI * 2)) < 1e-9);
  assert.equal(turntableYaw(0.5, 40, 15), turntableYaw(0.5, 15, 15));
});

test("query string turns showcase on and tunes timing", () => {
  assert.equal(parseShowcaseParams("").enabled, false);
  assert.equal(parseShowcaseParams("?showcase=0").enabled, false);
  assert.deepEqual(parseShowcaseParams("?showcase"), { enabled: true, timing });
  assert.deepEqual(parseShowcaseParams("?showcase=1&spin=30&hold=8"), { enabled: true, timing: { spinSeconds: 30, holdSeconds: 8 } });
  assert.deepEqual(parseShowcaseParams("?showcase&spin=abc&hold=0").timing, timing);
});
