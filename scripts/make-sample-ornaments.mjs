// Generates sample Rhino .3dm ornaments in fixtures/ with rhino3dm (Node).
// Usage: node scripts/make-sample-ornaments.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rhino3dm from "rhino3dm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "fixtures");
const rh = await rhino3dm();

/** UV sphere/ellipsoid, Rhino Z-up, as { positions, indices }. */
function sphere(radius, segments, rings, centre = [0, 0, 0], scale = [1, 1, 1]) {
  const positions = [];
  const indices = [];
  for (let r = 0; r <= rings; r += 1) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s <= segments; s += 1) {
      const theta = (2 * Math.PI * s) / segments;
      positions.push(
        centre[0] + radius * scale[0] * Math.sin(phi) * Math.cos(theta),
        centre[1] + radius * scale[1] * Math.sin(phi) * Math.sin(theta),
        centre[2] + radius * scale[2] * Math.cos(phi),
      );
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      if (r !== 0) indices.push(a, b, a + 1);
      if (r !== rings - 1) indices.push(a + 1, b, b + 1);
    }
  }
  return { positions, indices };
}

/** Closed cylinder along Z. */
function cylinder(radius, height, segments, base = [0, 0, 0]) {
  const positions = [base[0], base[1], base[2], base[0], base[1], base[2] + height];
  const indices = [];
  for (let s = 0; s < segments; s += 1) {
    const theta = (2 * Math.PI * s) / segments;
    const x = base[0] + radius * Math.cos(theta);
    const y = base[1] + radius * Math.sin(theta);
    positions.push(x, y, base[2], x, y, base[2] + height);
  }
  for (let s = 0; s < segments; s += 1) {
    const a = 2 + s * 2;
    const b = 2 + ((s + 1) % segments) * 2;
    indices.push(0, b, a, 1, a + 1, b + 1, a, b, a + 1, a + 1, b, b + 1);
  }
  return { positions, indices };
}

/** Extruded five-pointed star standing upright in the XZ plane, thickness along Y. */
function star(outer, inner, thickness) {
  const outline = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.PI / 2 + (Math.PI * i) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    outline.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  const positions = [0, -thickness / 2, 0, 0, thickness / 2, 0];
  for (const [x, z] of outline) positions.push(x, -thickness / 2, z, x, thickness / 2, z);
  const indices = [];
  for (let i = 0; i < 10; i += 1) {
    const a = 2 + i * 2;
    const b = 2 + ((i + 1) % 10) * 2;
    indices.push(0, a, b, 1, b + 1, a + 1, a, a + 1, b, b, a + 1, b + 1);
  }
  return { positions, indices };
}

/** Torus around Z. */
function torus(major, minor, segments, sides) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const u = (2 * Math.PI * i) / segments;
    for (let j = 0; j < sides; j += 1) {
      const v = (2 * Math.PI * j) / sides;
      const r = major + minor * Math.cos(v);
      positions.push(r * Math.cos(u), r * Math.sin(u), minor * Math.sin(v));
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * sides + j;
      const b = ((i + 1) % segments) * sides + j;
      const c = ((i + 1) % segments) * sides + ((j + 1) % sides);
      const d = i * sides + ((j + 1) % sides);
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, indices };
}

/** Stands a Z-axis shape upright ((x, y, z) → (x, z, y)) and moves it up by `lift`. */
function upright(shape, lift = 0) {
  const positions = [...shape.positions];
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    positions[i + 1] = positions[i + 2];
    positions[i + 2] = y + lift;
  }
  return { positions, indices: shape.indices };
}

function cube(side) {
  const h = side / 2;
  const positions = [-h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h, -h, -h, h, h, -h, h, h, h, h, -h, h, h];
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { positions, indices };
}

function toRhinoMesh({ positions, indices }) {
  const mesh = new rh.Mesh();
  const vertices = mesh.vertices();
  for (let i = 0; i < positions.length; i += 3) vertices.add(positions[i], positions[i + 1], positions[i + 2]);
  const faces = mesh.faces();
  for (let i = 0; i < indices.length; i += 3) faces.addTriFace(indices[i], indices[i + 1], indices[i + 2]);
  mesh.normals().computeNormals();
  mesh.compact();
  return mesh;
}

class Model {
  constructor(unit) {
    this.doc = new rh.File3dm();
    this.doc.settings().modelUnitSystem = unit;
    this.layers = new Map();
  }

  layer(name) {
    if (!this.layers.has(name)) {
      const layer = new rh.Layer();
      layer.name = name;
      this.layers.set(name, this.doc.layers().add(layer));
    }
    return this.layers.get(name);
  }

  /** Mesh with a render material (diffuse colour). */
  addMesh(shape, { layer = "Default", material, color } = {}) {
    const attributes = new rh.ObjectAttributes();
    attributes.layerIndex = this.layer(layer);
    if (material) {
      const rhinoMaterial = new rh.Material();
      rhinoMaterial.name = material.name;
      rhinoMaterial.diffuseColor = { r: material.rgb[0], g: material.rgb[1], b: material.rgb[2], a: 255 };
      attributes.materialIndex = this.doc.materials().add(rhinoMaterial);
      attributes.materialSource = rh.ObjectMaterialSource.MaterialFromObject;
    }
    if (color) {
      attributes.colorSource = rh.ObjectColorSource.ColorFromObject;
      attributes.objectColor = { r: color[0], g: color[1], b: color[2], a: 255 };
    }
    this.doc.objects().add(toRhinoMesh(shape), attributes);
  }

  addPoint(point, layer) {
    const attributes = new rh.ObjectAttributes();
    attributes.layerIndex = this.layer(layer);
    this.doc.objects().add(new rh.Point(point), attributes);
  }

  bytes() {
    return this.doc.toByteArray();
  }
}

const fixtures = {
  // ≈3" bauble in inches: red sphere, gold cap, eyelet on top of the cap.
  "bauble-eyelet-in.3dm": () => {
    const model = new Model(rh.UnitSystem.Inches);
    model.addMesh(sphere(1.5, 64, 40), { material: { name: "Red glass", rgb: [200, 20, 30] } });
    model.addMesh(cylinder(0.3, 0.3, 32, [0, 0, 1.42]), { material: { name: "Gold", rgb: [212, 175, 55] } });
    model.addPoint([0, 0, 1.72], "eyelet");
    return model;
  },
  // ≈80 mm star in millimetres, coloured by object display colour, eyelet above the top point.
  "star-mm.3dm": () => {
    const model = new Model(rh.UnitSystem.Millimeters);
    model.addMesh(star(40, 17, 10), { color: [250, 200, 40] });
    // A modelled ring on the eyelet layer is rendered; the point above it is the hanging point.
    model.addMesh(upright(torus(4, 1, 24, 12), 44), { layer: "eyelet", color: [190, 190, 200] });
    model.addPoint([0, 0, 49], "eyelet");
    return model;
  },
  // 5 cm green sphere in centimetres with no eyelet layer: exercises the fallback.
  "no-eyelet.3dm": () => {
    const model = new Model(rh.UnitSystem.Centimeters);
    model.addMesh(sphere(2.5, 48, 32, [10, 10, 5], [1, 1, 1.15]), { color: [30, 140, 60] });
    return model;
  },
  // 6" cube in inches: over the 4" limit.
  "too-big.3dm": () => {
    const model = new Model(rh.UnitSystem.Inches);
    model.addMesh(cube(6), { color: [80, 80, 200] });
    model.addPoint([0, 0, 3], "eyelet");
    return model;
  },
  // ≈200k-triangle, 3.1" sphere in metres with an eyelet.
  "dense-200k.3dm": () => {
    const model = new Model(rh.UnitSystem.Meters);
    model.addMesh(sphere(0.04, 400, 251), { material: { name: "Silver", rgb: [192, 192, 200] } });
    model.addPoint([0, 0, 0.04], "eyelet");
    return model;
  },
  // 1" torus with no unit system (treated as inches), eyelet at the top of the ring.
  "tiny-1in.3dm": () => {
    const model = new Model(rh.UnitSystem.None);
    model.addMesh(upright(torus(0.4, 0.1, 48, 16)), { color: [220, 30, 120] });
    model.addPoint([0, 0, 0.5], "Eyelet");
    return model;
  },
};

await mkdir(out, { recursive: true });
for (const [name, build] of Object.entries(fixtures)) {
  const bytes = build().bytes();
  await writeFile(resolve(out, name), bytes);
  console.log(`${name}\t${bytes.byteLength} bytes`);
}
