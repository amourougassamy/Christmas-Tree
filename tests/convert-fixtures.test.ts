import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readRhinoAsLoaderObject } from "../lib/convert/node-rhino.ts";
import { convertObject } from "../lib/convert/pipeline.ts";
import { ConvertError } from "../lib/convert/types.ts";
import { validatePreview } from "../lib/ornaments/preview-validation.ts";
import { MAX_PREVIEW_BYTES, MAX_PREVIEW_TRIANGLES } from "../lib/ornaments/types.ts";

// Real .3dm files from scripts/make-sample-ornaments.mjs, read with rhino3dm (Node) into the
// same object shape Rhino3dmLoader produces in the browser.
const expectations = {
  "bauble-eyelet-in.3dm": { eyelet: "layer", sizeInches: [3, 3.22, 3] },
  "star-mm.3dm": { eyelet: "layer", sizeInches: [3, 3.2, 0.39] },
  "no-eyelet.3dm": { eyelet: "fallback", sizeInches: [1.97, 2.26, 1.97] },
  "dense-200k.3dm": { eyelet: "layer", sizeInches: [3.15, 3.15, 3.15] },
  "tiny-1in.3dm": { eyelet: "layer", sizeInches: [1, 1, 0.2] },
  "too-big.3dm": { error: "TOO_BIG" },
} as const;

test("sample fixtures convert to valid previews", async (t) => {
  const rows = ["| fixture | .3dm → .glb | triangles | size (in) | eyelet |", "|---|---|---|---|---|"];
  for (const [name, expected] of Object.entries(expectations)) {
    const bytes = new Uint8Array(await readFile(new URL(`../fixtures/${name}`, import.meta.url)));
    const object = await readRhinoAsLoaderObject(bytes);
    const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
    if ("error" in expected) {
      await assert.rejects(convertObject(object), (error: unknown) => {
        assert.ok(error instanceof ConvertError);
        assert.equal(error.code, expected.error);
        rows.push(`| ${name} | ${kib(bytes.byteLength)} → rejected | – | ${error.message.match(/[\d.]+ × [\d.]+ × [\d.]+ in/)?.[0]} | ${error.code} |`);
        return true;
      });
      continue;
    }
    const { glb, report } = await convertObject(object);
    assert.equal(report.eyelet, expected.eyelet, name);
    assert.deepEqual(report.sizeInches, expected.sizeInches, name);
    assert.ok(report.triangles <= MAX_PREVIEW_TRIANGLES, name);
    assert.ok(glb.byteLength <= MAX_PREVIEW_BYTES, name);
    await validatePreview(glb);
    rows.push(
      `| ${name} | ${kib(bytes.byteLength)} → ${kib(glb.byteLength)} | ${report.sourceTriangles.toLocaleString("en-US")} → ${report.triangles.toLocaleString("en-US")} | ${report.sizeInches.join(" × ")} | ${report.eyelet}${report.eyeletWarning ? " (warning)" : ""} |`,
    );
  }
  for (const row of rows) t.diagnostic(row);
});
