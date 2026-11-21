import assert from "node:assert/strict";
import test from "node:test";
import { convertObject } from "../lib/convert/pipeline.ts";
import { ConvertError } from "../lib/convert/types.ts";
import { modelUnit } from "../lib/convert/units.ts";
import { validatePreview } from "../lib/ornaments/preview-validation.ts";
import { MAX_PREVIEW_BYTES, MAX_PREVIEW_MATERIALS, MAX_PREVIEW_TRIANGLES } from "../lib/ornaments/types.ts";
import { addLine, addMesh, addPoint, box, glbBounds, rhinoRoot, sphere } from "./convert-helpers.ts";

const close = (actual: number, expected: number, tolerance = 1e-3) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} ≈ ${expected}`);

test("model unit system maps to metres; none and unknown fall back to inches", () => {
  assert.equal(modelUnit({ modelUnitSystem: { name: "UnitSystem_Millimeters", value: 2 } }).metresPerUnit, 0.001);
  assert.equal(modelUnit({ modelUnitSystem: { name: "UnitSystem_Centimeters", value: 3 } }).metresPerUnit, 0.01);
  assert.equal(modelUnit({ modelUnitSystem: { name: "UnitSystem_Meters", value: 4 } }).metresPerUnit, 1);
  assert.equal(modelUnit({ modelUnitSystem: { name: "UnitSystem_Inches", value: 8 } }).metresPerUnit, 0.0254);
  close(modelUnit({ modelUnitSystem: { value: 9 } }).metresPerUnit, 0.3048, 1e-9);
  for (const settings of [undefined, {}, { modelUnitSystem: { name: "UnitSystem_None", value: 0 } }, { modelUnitSystem: { name: "UnitSystem_CustomUnits", value: 11 } }]) {
    const unit = modelUnit(settings);
    assert.equal(unit.metresPerUnit, 0.0254);
    assert.equal(unit.assumed, true);
  }
});

test("millimetre models are scaled to true size", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Millimeters");
  addMesh(root, box(76.2, 50.8, 25.4));
  addPoint(root, [0, 0, 12.7]);
  const { report, glb } = await convertObject(root);
  assert.deepEqual(report.sizeInches, [3, 1, 2]); // Rhino Z (25.4 mm) becomes glTF Y
  assert.equal(report.unit.name, "Millimeters");
  const { min, max } = await glbBounds(glb);
  close(max[0] - min[0], 0.0762);
  close(max[1] - min[1], 0.0254);
  close(max[2] - min[2], 0.0508);
});

test("files with no unit system are treated as inches", async () => {
  const root = rhinoRoot(["Default", "eyelet"]);
  addMesh(root, box(2, 2, 2));
  addPoint(root, [0, 0, 1]);
  const { report } = await convertObject(root);
  assert.deepEqual(report.sizeInches, [2, 2, 2]);
  assert.equal(report.unit.assumed, true);
});

test("Rhino Z-up becomes glTF Y-up", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  addMesh(root, box(1, 1, 3));
  addPoint(root, [0, 0, 1.5]);
  const { report, glb } = await convertObject(root);
  assert.deepEqual(report.sizeInches, [1, 3, 1]);
  const { min, max } = await glbBounds(glb);
  close(max[1], 0); // the top of the column is the eyelet
  close(min[1], -3 * 0.0254);
});

test("the eyelet point becomes the origin and its layer's points are not rendered", async () => {
  const root = rhinoRoot(["Default", "Eyelet"], "Inches");
  addMesh(root, box(2, 2, 2, [5, 5, 5])); // spans x 4..6, y 4..6, z 4..6
  addPoint(root, [6, 5, 5]); // on the +X face, mid-height
  addLine(root, [0, 0, 0, 100, 100, 100], 1); // a curve on the eyelet layer: ignored
  addLine(root, [0, 0, 0, -100, -100, -100], 0); // a curve elsewhere: also dropped
  const { report, glb } = await convertObject(root);
  assert.equal(report.eyelet, "layer");
  assert.equal(report.eyeletWarning, undefined);
  const { min, max, document } = await glbBounds(glb);
  close(min[0], -2 * 0.0254);
  close(max[0], 0);
  close(min[1], -0.0254);
  close(max[1], 0.0254);
  close(min[2], -0.0254);
  close(max[2], 0.0254);
  assert.deepEqual(document.getRoot().getAsset().extras, { eyelet: "layer", sizeInches: [2, 2, 2] });
});

test("several eyelet points use the highest; meshes on the eyelet layer are kept", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  addMesh(root, sphere(1, 24, 12));
  addMesh(root, box(0.2, 0.2, 0.5, [0, 0, 1.2]), 1, 0xd4af37); // modelled ring on the eyelet layer
  addPoint(root, [0, 0, 0]);
  addPoint(root, [0, 0, 1.45]);
  addPoint(root, [0, 0, -1]);
  const { report, glb } = await convertObject(root);
  assert.equal(report.eyelet, "layer");
  assert.match(report.eyeletWarning ?? "", /highest/);
  assert.equal(report.materials, 2);
  const { min, max } = await glbBounds(glb);
  close(max[1], 0); // the highest point (1.45, the ring top) is the origin
  close(min[1], -2.45 * 0.0254);
});

test("missing eyelet falls back to the top centre of the bounding box with a warning", async () => {
  const root = rhinoRoot(["Default"], "Inches");
  addMesh(root, box(2, 1, 3, [10, -4, 7]));
  const { report, glb } = await convertObject(root);
  assert.equal(report.eyelet, "fallback");
  assert.match(report.eyeletWarning ?? "", /eyelet/);
  const { min, max } = await glbBounds(glb);
  close(max[1], 0);
  close(min[0] + max[0], 0);
  close(min[2] + max[2], 0);
});

test("an eyelet layer with no point also falls back", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  addMesh(root, box(1, 1, 1));
  const { report } = await convertObject(root);
  assert.equal(report.eyelet, "fallback");
  assert.match(report.eyeletWarning ?? "", /no point/);
});

test("a ~200k-triangle model meets the triangle and byte budgets and passes server validation", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Millimeters");
  addMesh(root, sphere(38, 400, 250));
  addPoint(root, [0, 0, 38]);
  const { report, glb } = await convertObject(root);
  assert.ok(report.sourceTriangles >= 190_000, `source had ${report.sourceTriangles} triangles`);
  assert.ok(report.triangles <= MAX_PREVIEW_TRIANGLES);
  assert.ok(report.triangles > MAX_PREVIEW_TRIANGLES / 2);
  assert.ok(glb.byteLength <= MAX_PREVIEW_BYTES, `${glb.byteLength} bytes`);
  assert.equal(report.bytes, glb.byteLength);
  const stats = await validatePreview(glb);
  assert.equal(stats.triangles, report.triangles);
  close(stats.sizeMetres[1], 0.076, 0.001);
});

test("many colours merge into at most the material budget", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  const colours = [0xff0000, 0xfe0101, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff, 0x101010];
  colours.forEach((colour, i) => addMesh(root, sphere(0.2, 8, 6, [i * 0.4 - 1.4, 0, 0]), 0, colour));
  addPoint(root, [0, 0, 0.2]);
  const { report, glb } = await convertObject(root);
  assert.equal(report.materials, MAX_PREVIEW_MATERIALS);
  const stats = await validatePreview(glb);
  assert.equal(stats.materials, MAX_PREVIEW_MATERIALS);
});

test("oversize models are rejected with the measured size in inches", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  addMesh(root, box(6, 6, 6));
  addPoint(root, [0, 0, 3]);
  await assert.rejects(convertObject(root), (error: unknown) => {
    assert.ok(error instanceof ConvertError);
    assert.equal(error.code, "TOO_BIG");
    assert.match(error.message, /6\.00 × 6\.00 × 6\.00 in/);
    assert.match(error.message, /4″/);
    return true;
  });
});

test("files without meshes are rejected", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  addLine(root, [0, 0, 0, 1, 1, 1]);
  addPoint(root, [0, 0, 1]);
  await assert.rejects(convertObject(root), (error: unknown) => error instanceof ConvertError && error.code === "NO_GEOMETRY");
});

test("hidden objects are not rendered", async () => {
  const root = rhinoRoot(["Default", "eyelet"], "Inches");
  addMesh(root, box(1, 1, 1));
  addMesh(root, box(10, 10, 10)).visible = false;
  addPoint(root, [0, 0, 0.5]);
  const { report } = await convertObject(root);
  assert.deepEqual(report.sizeInches, [1, 1, 1]);
});
