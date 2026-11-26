import test from "node:test";
import assert from "node:assert/strict";
import { gustEnvelope, snowAmount, surprisePhase, surpriseStart, waveAngle } from "../lib/tree/surprises.ts";

test("sleigh intervals stay between eight and fifteen minutes", () => {
  for (let slot = 0; slot < 500; slot++) {
    const gap = surpriseStart(slot + 1, "sleigh") - surpriseStart(slot, "sleigh");
    assert.ok(gap >= 480000 && gap <= 900000);
  }
});
test("fast preview repeats approximately every twenty seconds", () => {
  for (const kind of ["sleigh", "wave", "gust"] as const) {
    const start = surpriseStart(100, kind, true);
    assert.equal(surprisePhase(start, kind, true), 0);
    assert.equal(surprisePhase(start + 15000, kind, true), -1);
    assert.ok(Math.abs(surpriseStart(101, kind, true) - start - 20000) <= 2000);
  }
});
test("gust and wave ease in and return to rest", () => {
  const gust = surpriseStart(10, "gust");
  assert.equal(gustEnvelope(gust), 0);
  assert.ok(gustEnvelope(gust + 2250) > 0.99);
  assert.equal(gustEnvelope(gust + 4500), 0);
  const wave = surpriseStart(10, "wave");
  assert.equal(waveAngle(wave), 0);
  assert.ok(waveAngle(wave + 1800) > 0);
  assert.equal(waveAngle(wave + 3600), 0);
});
test("snow builds locally during the day and resets overnight", () => {
  const at = (hour: number) => new Date(2026, 11, 1, hour);
  assert.equal(snowAmount(at(6)), 0);
  assert.equal(snowAmount(at(12)), 0.5);
  assert.equal(snowAmount(at(18)), 1);
  assert.equal(snowAmount(at(23)), 1);
  assert.equal(snowAmount(at(0)), 0);
});
