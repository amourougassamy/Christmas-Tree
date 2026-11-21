#!/usr/bin/env node
// Dev-only: writes sample ornament previews to fixtures/glb/ that follow the
// "Preview format" in API_CONTRACT.md: metres, Y-up, origin at the eyelet,
// at most 4" per side, base-colour PBR materials, meshopt + quantization.
//
//   node scripts/make-sample-glbs.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import {
  Box3,
  ConeGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const INCH = 0.0254;
const outDir = fileURLToPath(new URL("../fixtures/glb/", import.meta.url));

/** Shapes are authored at roughly unit size, hanging below y = 0. */
const shapes = {
  bauble: () => [
    { geometry: new SphereGeometry(0.5, 28, 18).translate(0, -0.62, 0), material: "body" },
    { geometry: new LatheGeometry([new Vector2(0.001, -0.06), new Vector2(0.11, -0.06), new Vector2(0.12, -0.16), new Vector2(0.001, -0.16)], 16), material: "cap" },
  ],
  bell: () => [
    {
      geometry: new LatheGeometry(
        [[0.001, -0.08], [0.12, -0.1], [0.2, -0.2], [0.25, -0.45], [0.34, -0.7], [0.48, -0.86], [0.5, -0.92], [0.001, -0.92]].map(([x, y]) => new Vector2(x, y)),
        28,
      ),
      material: "body",
    },
    { geometry: new SphereGeometry(0.09, 12, 8).translate(0, -0.95, 0), material: "cap" },
  ],
  icicle: () => [
    { geometry: new ConeGeometry(0.18, 1, 14).rotateX(Math.PI).translate(0, -0.77, 0), material: "body" },
    { geometry: new SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, -0.27, 0), material: "cap" },
  ],
  gem: () => [
    { geometry: new IcosahedronGeometry(0.45, 0).scale(0.8, 1.15, 0.8).translate(0, -0.6, 0), material: "body" },
  ],
  star: () => {
    const shape = new Shape();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? 0.5 : 0.22;
      const a = (i / 10) * Math.PI * 2;
      const [x, y] = [Math.sin(a) * r, Math.cos(a) * r - 0.58];
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const body = new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    body.translate(0, 0, -0.06);
    return [{ geometry: body, material: "body" }];
  },
};

const ring = () => ({ geometry: new TorusGeometry(0.05, 0.014, 6, 16).translate(0, -0.05, 0), material: "cap" });

const colours = {
  red: [0.62, 0.08, 0.06],
  gold: [0.85, 0.62, 0.2],
  ice: [0.72, 0.86, 0.95],
  green: [0.12, 0.42, 0.24],
  plum: [0.42, 0.12, 0.36],
  silver: [0.8, 0.8, 0.82],
};

const samples = [
  ["bauble", "red", 4],
  ["bauble", "gold", 3],
  ["bauble", "ice", 2],
  ["bell", "gold", 3.5],
  ["bell", "silver", 2],
  ["icicle", "ice", 4],
  ["icicle", "silver", 2.5],
  ["gem", "plum", 3],
  ["gem", "green", 1.5],
  ["star", "gold", 4],
  ["star", "red", 2.5],
  ["bauble", "green", 1],
];

function addPrimitive(doc, buffer, geometry, material) {
  const indexed = geometry;
  const position = indexed.getAttribute("position");
  const normal = indexed.getAttribute("normal");
  const count = position.count;
  const indices = indexed.index ? Uint32Array.from(indexed.index.array) : Uint32Array.from({ length: count }, (_, i) => i);
  return doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(Float32Array.from(position.array)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(Float32Array.from(normal.array)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
    .setMaterial(material);
}

/** Merge parts that share a material, so the file has one primitive per material. */
function mergeByMaterial(parts) {
  const groups = new Map();
  for (const part of parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    geometry.computeVertexNormals();
    const list = groups.get(part.material) ?? [];
    list.push(geometry);
    groups.set(part.material, list);
  }
  return [...groups].map(([material, geometries]) => {
    const merged = geometries[0].clone();
    const positions = [];
    const normals = [];
    for (const geometry of geometries) {
      positions.push(...geometry.getAttribute("position").array);
      normals.push(...geometry.getAttribute("normal").array);
    }
    merged.setAttribute("position", new merged.attributes.position.constructor(Float32Array.from(positions), 3));
    merged.setAttribute("normal", new merged.attributes.normal.constructor(Float32Array.from(normals), 3));
    return { material, geometry: mergeVertices(merged, 1e-6) };
  });
}

await MeshoptEncoder.ready;
await mkdir(outDir, { recursive: true });
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

for (const [shapeName, colourName, inches] of samples) {
  const parts = [...shapes[shapeName](), ring()];
  // Scale so the largest bounding-box side is exactly `inches`, keeping the eyelet at the origin.
  const box = new Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox);
  }
  const size = box.getSize(new (box.min.constructor)());
  const scale = (inches * INCH) / Math.max(size.x, size.y, size.z);
  for (const part of parts) part.geometry.scale(scale, scale, scale);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const materials = {
    body: doc.createMaterial("body").setBaseColorFactor([...colours[colourName], 1]).setMetallicFactor(0.35).setRoughnessFactor(0.32),
    cap: doc.createMaterial("cap").setBaseColorFactor([0.82, 0.66, 0.3, 1]).setMetallicFactor(0.9).setRoughnessFactor(0.3),
  };
  const mesh = doc.createMesh(shapeName);
  for (const { material, geometry } of mergeByMaterial(parts)) {
    mesh.addPrimitive(addPrimitive(doc, buffer, geometry, materials[material]));
  }
  const node = doc.createNode(shapeName).setMesh(mesh);
  doc.createScene().addChild(node);
  doc.getRoot().getAsset().extras = {
    eyelet: "layer",
    sizeInches: [size.x, size.y, size.z].map((side) => Number(((side * scale) / INCH).toFixed(3))),
  };

  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bytes = await io.writeBinary(doc);
  const name = `${shapeName}-${colourName}-${String(inches).replace(".", "_")}in.glb`;
  await writeFile(new URL(name, `file://${outDir}`), bytes);
  console.log(`${name}\t${bytes.byteLength} B`);
}
