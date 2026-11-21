import assert from "node:assert/strict";
import test from "node:test";
import { prepareGlb } from "../lib/ornaments/prepare-glb.ts";
import { previewIO } from "../lib/ornaments/gltf-io.ts";
import { rawGlb } from "./convert-helpers.ts";

test("direct GLB is hung from its top centre without changing size or materials", async () => {
  const io = await previewIO();
  const document = await io.readBinary(await rawGlb({ sizeMetres: 0.0762, materials: 2 }));
  document.getRoot().listNodes()[0].setTranslation([4, 6, -8]);
  const source = await io.writeBinary(document);
  const prepared = await prepareGlb(source);
  const { boundsMetres: [min, max], sizeMetres, materials } = prepared.report;
  assert.equal(materials, 2);
  assert.ok(Math.abs(max[1]) < 1e-5, "highest point is at the hook");
  assert.ok(Math.abs(min[0] + max[0]) < 1e-5, "centred on X");
  assert.ok(Math.abs(min[2] + max[2]) < 1e-5, "centred on Z");
  for (const size of sizeMetres) assert.ok(Math.abs(size - 0.0762) < 1e-5, "true size retained");
  const again = await prepareGlb(prepared.glb);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(Math.abs(again.report.boundsMetres[0][axis] - min[axis]) < 1e-5, "preparation is idempotent");
  }
});

test("direct GLB rejects oversize geometry instead of silently scaling it", async () => {
  const bytes = await rawGlb({ sizeMetres: 0.2 });
  await assert.rejects(() => prepareGlb(bytes), { code: "ORNAMENT_TOO_BIG" });
});
