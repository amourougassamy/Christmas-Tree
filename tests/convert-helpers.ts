import { Document, Logger, Primitive } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Line, Mesh, MeshStandardMaterial, Object3D, Points, SphereGeometry } from "three";
import { previewIO } from "../lib/ornaments/gltf-io.ts";

export interface TestLayer {
  name: string;
}

/** An object shaped like Rhino3dmLoader's result: layers and settings in userData. */
export function rhinoRoot(layers: string[] = ["Default", "eyelet"], unit?: string): Object3D {
  const root = new Object3D();
  root.userData.layers = layers.map((name) => ({ name, fullPath: name, visible: true }));
  root.userData.settings = unit ? { modelUnitSystem: { name: `UnitSystem_${unit}`, value: 0 } } : {};
  root.userData.objectType = "File3dm";
  return root;
}

export function addMesh(root: Object3D, geometry: BufferGeometry, layerIndex = 0, color = 0xcc2222): Mesh {
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, name: "Paint" }));
  mesh.userData.attributes = { layerIndex, drawColor: { r: 255, g: 255, b: 255, a: 255 } };
  root.add(mesh);
  return mesh;
}

export function addPoint(root: Object3D, [x, y, z]: [number, number, number], layerIndex = 1): Points {
  const points = new Points(new BufferGeometry().setAttribute("position", new Float32BufferAttribute([x, y, z], 3)));
  points.userData.attributes = { layerIndex };
  root.add(points);
  return points;
}

export function addLine(root: Object3D, positions: number[], layerIndex = 0): Line {
  const line = new Line(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3)));
  line.userData.attributes = { layerIndex };
  root.add(line);
  return line;
}

export function box(x: number, y: number, z: number, at: [number, number, number] = [0, 0, 0]): BufferGeometry {
  return new BoxGeometry(x, y, z).translate(...at);
}

export function sphere(radius: number, widthSegments = 32, heightSegments = 16, at: [number, number, number] = [0, 0, 0]) {
  return new SphereGeometry(radius, widthSegments, heightSegments).translate(...at);
}

/** World-space bounds of a .glb, in metres. */
export async function glbBounds(glb: Uint8Array) {
  const document = await (await previewIO()).readBinary(glb);
  return { document, ...getBounds(document.getRoot().listScenes()[0]) };
}

/**
 * A hand-built .glb (no converter) for exercising the server validator with things the
 * converter never produces.
 */
export async function rawGlb(options: {
  triangles?: number;
  sizeMetres?: number;
  texture?: boolean;
  mode?: number;
  materials?: number;
  extensionsUsed?: string[];
} = {}): Promise<Uint8Array> {
  const { triangles = 12, sizeMetres = 0.05, texture = false, mode = Primitive.Mode.TRIANGLES, materials = 1 } = options;
  const document = new Document().setLogger(new Logger(Logger.Verbosity.SILENT));
  const buffer = document.createBuffer();
  const mesh = document.createMesh();
  const perMaterial = Math.ceil(triangles / materials);
  for (let m = 0; m < materials; m += 1) {
    const count = Math.min(perMaterial, triangles - m * perMaterial);
    // Cube corners, with the cube's 12 triangles repeated to reach `count`.
    const h = sizeMetres;
    const positions = new Float32Array([0, 0, 0, h, 0, 0, h, h, 0, 0, h, 0, 0, 0, h, h, 0, h, h, h, h, 0, h, h]);
    const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const indices = new Uint16Array(count * 3);
    for (let i = 0; i < indices.length; i += 1) indices[i] = faces[i % faces.length];
    const material = document.createMaterial(`m${m}`).setBaseColorFactor([1, 0, 0, 1]);
    if (texture && m === 0) {
      const png = Uint8Array.from(Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
        "base64",
      ));
      material.setBaseColorTexture(document.createTexture("t").setImage(png).setMimeType("image/png"));
    }
    mesh.addPrimitive(
      document
        .createPrimitive()
        .setMode(mode as 4)
        .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
        .setIndices(document.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
        .setMaterial(material),
    );
  }
  document.createScene().addChild(document.createNode().setMesh(mesh));
  const glb = await (await previewIO()).writeBinary(document);
  return options.extensionsUsed ? withExtensions(glb, options.extensionsUsed) : glb;
}

/** Rewrites a .glb's JSON chunk to declare extra extensions. */
function withExtensions(glb: Uint8Array, extensions: string[]): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  json.extensionsUsed = [...(json.extensionsUsed ?? []), ...extensions];
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += " ";
  const jsonBytes = new TextEncoder().encode(text);
  const rest = glb.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + jsonBytes.length + rest.length);
  const outView = new DataView(out.buffer);
  out.set(glb.subarray(0, 12));
  outView.setUint32(8, out.length, true);
  outView.setUint32(12, jsonBytes.length, true);
  outView.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.set(rest, 20 + jsonBytes.length);
  return out;
}
