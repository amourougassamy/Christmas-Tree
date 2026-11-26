import assert from "node:assert/strict";
import test from "node:test";
import { getTimeOfDay, previewTime, TIME_OF_DAY_KEYFRAMES } from "../lib/tree/time-of-day.ts";
const dateAt = (minute: number) => new Date(2026, 10, 25, 0, minute);
test("all art direction keyframes are hit exactly, including original dusk", () => {
  for (const { minute, ...expected } of TIME_OF_DAY_KEYFRAMES) assert.deepEqual(getTimeOfDay(dateAt(minute)), expected);
  assert.equal(getTimeOfDay(dateAt(1050)).ambient, "#b2b6d4");
});
test("every minute is finite and within the keyframe ranges", () => {
  for (let minute = 0; minute < 1440; minute++) {
    const look = getTimeOfDay(dateAt(minute));
    for (const [key, value] of Object.entries(look)) {
      if (typeof value === "number") {
        const bounds = TIME_OF_DAY_KEYFRAMES.map((frame) => frame[key as keyof typeof frame]).filter((v): v is number => typeof v === "number");
        assert.ok(Number.isFinite(value) && value >= Math.min(...bounds) - 1e-10 && value <= Math.max(...bounds) + 1e-10);
      } else assert.match(value, /^#[0-9a-f]{6}$/);
    }
  }
});
test("cyclic curve is continuous at midnight and frame boundaries", () => {
  for (const minute of [0, ...TIME_OF_DAY_KEYFRAMES.map((frame) => frame.minute)]) {
    const before = getTimeOfDay(dateAt(minute - 1));
    const after = getTimeOfDay(dateAt(minute + 1));
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      const a = before[key], b = after[key];
      if (typeof a === "number" && typeof b === "number") assert.ok(Math.abs(a - b) < 0.02, key);
      else if (typeof a === "string" && typeof b === "string") for (const offset of [1, 3, 5]) assert.ok(Math.abs(parseInt(a.slice(offset, offset + 2), 16) - parseInt(b.slice(offset, offset + 2), 16)) <= 2);
    }
  }
});
test("preview clock accepts HH:MM and rejects invalid overrides", () => {
  const now = dateAt(600);
  assert.equal(previewTime("22:30", now).getHours(), 22);
  assert.equal(previewTime("22:30", now).getMinutes(), 30);
  for (const invalid of [null, "24:00", "09:60", "9:00", "oops"]) assert.equal(previewTime(invalid, now).getTime(), now.getTime());
  assert.equal(now.getHours(), 10);
});
