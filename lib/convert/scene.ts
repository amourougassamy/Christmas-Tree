import { Box3, Matrix4, Vector3 } from "three";
import type { BufferGeometry, Material, Mesh, Object3D, Points } from "three";
import type { EyeletSource } from "./types.ts";

/** A renderable triangle mesh, already in glTF space: metres, Y-up, world transform baked in. */
export interface MeshPart {
  positions: Float32Array;
  indices: Uint32Array;
  /** Base colour in sRGB 0-1, plus alpha. */
  color: [number, number, number];
  alpha: number;
  metalness: number;
  roughness: number;
}

export interface CollectedScene {
  parts: MeshPart[];
  /** Eyelet point candidates in the same space as `parts`. */
  eyeletPoints: Vector3[];
  eyeletLayerFound: boolean;
}

export interface Hanging {
  source: EyeletSource;
  point: Vector3;
  warning?: string;
}

interface RhinoLayer {
  name?: string;
  fullPath?: string;
}

interface RhinoColor {
  r: number;
  g: number;
  b: number;
}

const DEFAULT_MATERIAL_NAME = "__DEFAULT";

/** Rhino is Z-up, glTF is Y-up: (x, y, z) → (x, z, -y). */
export function zUpToYUp(): Matrix4 {
  return new Matrix4().makeRotationX(-Math.PI / 2);
}

export function isEyeletLayer(layer: RhinoLayer | undefined): boolean {
  if (!layer) return false;
  const own = (layer.name ?? layer.fullPath?.split("::").at(-1) ?? "").trim().toLowerCase();
  return own === "eyelet";
}

/**
 * Walks the object Rhino3dmLoader returns and collects meshes and eyelet points in
 * metres, Y-up. Lines, points, sprites, and lights are dropped; points and curves on the
 * `eyelet` layer become eyelet candidates (points) or are ignored (curves).
 */
export function collectScene(root: Object3D, metresPerUnit: number): CollectedScene {
  const layers = (root.userData?.layers ?? []) as RhinoLayer[];
  const eyeletLayerFound = layers.some(isEyeletLayer);
  const base = zUpToYUp().multiply(new Matrix4().makeScale(metresPerUnit, metresPerUnit, metresPerUnit));
  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();

  const parts: MeshPart[] = [];
  const eyeletPoints: Vector3[] = [];

  root.traverse((object) => {
    if (object === root) return;
    const layerIndex = object.userData?.attributes?.layerIndex;
    const onEyelet = typeof layerIndex === "number" && isEyeletLayer(layers[layerIndex]);
    const matrix = new Matrix4().multiplyMatrices(base, new Matrix4().multiplyMatrices(rootInverse, object.matrixWorld));

    if ((object as Points).isPoints) {
      if (!onEyelet) return;
      const position = (object as Points).geometry.getAttribute("position");
      if (!position) return;
      for (let i = 0; i < position.count; i += 1) {
        const point = new Vector3(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
        if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) eyeletPoints.push(point);
      }
      return;
    }

    const mesh = object as Mesh;
    if (!mesh.isMesh || !isVisible(object, root)) return;
    parts.push(...meshParts(mesh, matrix));
  });

  return { parts, eyeletPoints, eyeletLayerFound };
}

/** The hanging point: the highest eyelet point, or the top-centre of the bounding box. */
export function resolveHanging(scene: CollectedScene, bounds: Box3): Hanging {
  if (scene.eyeletPoints.length > 0) {
    const point = scene.eyeletPoints.reduce((best, candidate) => (candidate.y > best.y ? candidate : best));
    const warning =
      scene.eyeletPoints.length > 1
        ? `Found ${scene.eyeletPoints.length} points on the eyelet layer; hanging from the highest one.`
        : undefined;
    return { source: "layer", point: point.clone(), warning };
  }
  const centre = bounds.getCenter(new Vector3());
  const warning = scene.eyeletLayerFound
    ? "The eyelet layer has no point on it, so the ornament will hang from the top centre. Add a point on the eyelet layer where it should hang."
    : "No layer named “eyelet” was found, so the ornament will hang from the top centre. Add a point on a layer named eyelet where it should hang.";
  return { source: "fallback", point: new Vector3(centre.x, bounds.max.y, centre.z), warning };
}

export function partsBounds(parts: readonly MeshPart[]): Box3 {
  const box = new Box3();
  const point = new Vector3();
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      box.expandByPoint(point.set(part.positions[i], part.positions[i + 1], part.positions[i + 2]));
    }
  }
  return box;
}

export function translateParts(parts: readonly MeshPart[], offset: Vector3): void {
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      part.positions[i] += offset.x;
      part.positions[i + 1] += offset.y;
      part.positions[i + 2] += offset.z;
    }
  }
}

function isVisible(object: Object3D, root: Object3D): boolean {
  for (let current: Object3D | null = object; current && current !== root; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function meshParts(mesh: Mesh, matrix: Matrix4): MeshPart[] {
  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) return [];

  const flip = matrix.determinant() < 0;
  const allPositions = new Float32Array(position.count * 3);
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
    allPositions[i * 3] = vertex.x;
    allPositions[i * 3 + 1] = vertex.y;
    allPositions[i * 3 + 2] = vertex.z;
  }

  const index = geometry.getIndex();
  const indexCount = index ? index.count : position.count;
  const indexAt = (i: number) => (index ? index.getX(i) : i);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const ranges =
    Array.isArray(mesh.material) && geometry.groups.length > 0
      ? geometry.groups.map((group) => ({ start: group.start, count: group.count, material: materials[group.materialIndex ?? 0] }))
      : [{ start: 0, count: indexCount, material: materials[0] }];

  const drawColor = mesh.userData?.attributes?.drawColor as RhinoColor | undefined;
  const parts: MeshPart[] = [];
  for (const range of ranges) {
    const end = Math.min(indexCount, range.start + range.count);
    const triangles: number[] = [];
    for (let i = range.start; i + 2 < end; i += 3) {
      const a = indexAt(i);
      const b = indexAt(i + 1);
      const c = indexAt(i + 2);
      if (a === b || b === c || a === c) continue;
      if (![a, b, c].every((v) => Number.isFinite(allPositions[v * 3]) && Number.isFinite(allPositions[v * 3 + 1]) && Number.isFinite(allPositions[v * 3 + 2]))) continue;
      if (flip) triangles.push(a, c, b);
      else triangles.push(a, b, c);
    }
    if (triangles.length === 0) continue;
    parts.push({ positions: allPositions, indices: Uint32Array.from(triangles), ...surface(range.material, drawColor) });
  }
  return compactSharedPositions(parts);
}

/** Give each part its own compact vertex array (parts from one mesh initially share positions). */
function compactSharedPositions(parts: MeshPart[]): MeshPart[] {
  return parts.map((part) => {
    const remap = new Map<number, number>();
    const indices = new Uint32Array(part.indices.length);
    const positions: number[] = [];
    part.indices.forEach((oldIndex, i) => {
      let newIndex = remap.get(oldIndex);
      if (newIndex === undefined) {
        newIndex = remap.size;
        remap.set(oldIndex, newIndex);
        positions.push(part.positions[oldIndex * 3], part.positions[oldIndex * 3 + 1], part.positions[oldIndex * 3 + 2]);
      }
      indices[i] = newIndex;
    });
    return { ...part, positions: Float32Array.from(positions), indices };
  });
}

function surface(material: Material | undefined, drawColor: RhinoColor | undefined): Omit<MeshPart, "positions" | "indices"> {
  const standard = material as (Material & { color?: { r: number; g: number; b: number }; metalness?: number; roughness?: number }) | undefined;
  const useDisplayColor = !standard?.color || standard.name === DEFAULT_MATERIAL_NAME;
  const color: [number, number, number] =
    useDisplayColor && drawColor
      ? [drawColor.r / 255, drawColor.g / 255, drawColor.b / 255]
      : standard?.color
        ? [standard.color.r, standard.color.g, standard.color.b]
        : [0.8, 0.8, 0.8];
  const transparent = Boolean(standard?.transparent);
  return {
    color: color.map((value) => Math.min(1, Math.max(0, value))) as [number, number, number],
    alpha: transparent ? Math.min(1, Math.max(0.05, standard?.opacity ?? 1)) : 1,
    // The loader's default material is metalness 0.8, which renders near-black without an
    // environment map; display-colour meshes get a plain painted look instead.
    metalness: useDisplayColor ? 0.1 : clamp01(standard?.metalness ?? 0),
    roughness: useDisplayColor ? 0.5 : clamp01(standard?.roughness ?? 0.5),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
