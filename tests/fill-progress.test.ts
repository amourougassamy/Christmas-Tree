import assert from "node:assert/strict";
import test from "node:test";
import { treeFillProgress } from "../lib/tree/fill-progress.ts";

test("empty, partial, singular and full tree progress", () => {
  assert.deepEqual(treeFillProgress(0, 60), { decorated: 0, total: 60, percent: 0, label: "0 of 60 branches decorated" });
  assert.equal(treeFillProgress(1, 60).label, "1 of 60 branches decorated");
  assert.equal(treeFillProgress(15, 60).percent, 25);
  assert.equal(treeFillProgress(0, 1).label, "0 of 1 branch decorated");
  assert.equal(treeFillProgress(60, 60).label, "Every branch decorated!");
  assert.equal(treeFillProgress(61, 60).percent, 100);
  assert.equal(treeFillProgress(-1, 60).decorated, 0);
  assert.equal(treeFillProgress(0, 0).percent, 0);
});
