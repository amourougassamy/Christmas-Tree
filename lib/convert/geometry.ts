import { BufferAttribute, BufferGeometry } from "three";
import { mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import type { MeshPart } from "./scene.ts";

/** One output primitive: a single material and its merged, indexed triangles. */
export interface ColorGroup {
  color: [number, number, number];
  alpha: number;
  metalness: number;
  roughness: number;
  positions: Float32Array;
  indices: Uint32Array;
}

export interface FinalGroup extends ColorGroup {
  normals: Float32Array;
}

/** Colours closer than this (Euclidean, sRGB 0-1) share a material. */
const SIMILAR_COLOR = 0.08;
/** Vertices closer than this (metres) are welded before simplifying. */
const WELD_TOLERANCE_METRES = 1e-5;
const CREASE_ANGLE = Math.PI / 6;

export function triangleCount(groups: readonly { indices: Uint32Array }[]): number {
  return groups.reduce((sum, group) => sum + group.indices.length / 3, 0);
}

/**
 * Groups parts by base colour (merging similar colours), then merges the smallest groups
 * into their nearest colour until at most `maxGroups` remain.
 */
export function groupByColor(parts: readonly MeshPart[], maxGroups: number): ColorGroup[] {
  const buckets: { key: MeshPart; members: MeshPart[] }[] = [];
  const sorted = [...parts].sort((a, b) => b.indices.length - a.indices.length);
  for (const part of sorted) {
    const bucket = buckets.find((candidate) => colorDistance(candidate.key, part) < SIMILAR_COLOR);
    if (bucket) bucket.members.push(part);
    else buckets.push({ key: part, members: [part] });
  }

  while (buckets.length > maxGroups) {
    buckets.sort((a, b) => weight(b.members) - weight(a.members));
    const smallest = buckets.pop()!;
    let nearest = buckets[0];
    for (const bucket of buckets) {
      if (colorDistance(bucket.key, smallest.key) < colorDistance(nearest.key, smallest.key)) nearest = bucket;
    }
    nearest.members.push(...smallest.members);
  }

  return buckets.map(({ key, members }) => {
    const total = weight(members);
    const average = (pick: (part: MeshPart) => number) =>
      members.reduce((sum, part) => sum + pick(part) * part.indices.length, 0) / total;
    return {
      color: key.color,
      alpha: key.alpha,
      metalness: average((part) => part.metalness),
      roughness: average((part) => part.roughness),
      ...mergeParts(members),
    };
  });
}

/** Concatenates parts and welds coincident vertices. */
export function mergeParts(parts: readonly { positions: Float32Array; indices: Uint32Array }[]): {
  positions: Float32Array;
  indices: Uint32Array;
} {
  const vertexCount = parts.reduce((sum, part) => sum + part.positions.length / 3, 0);
  const indexCount = parts.reduce((sum, part) => sum + part.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vertexOffset * 3);
    for (let i = 0; i < part.indices.length; i += 1) indices[indexOffset + i] = part.indices[i] + vertexOffset;
    vertexOffset += part.positions.length / 3;
    indexOffset += part.indices.length;
  }
  return weld(positions, indices);
}

export function weld(positions: Float32Array, indices: Uint32Array, tolerance = WELD_TOLERANCE_METRES) {
  const lookup = new Map<string, number>();
  const remap = new Uint32Array(positions.length / 3);
  const welded: number[] = [];
  for (let v = 0; v < remap.length; v += 1) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
    let target = lookup.get(key);
    if (target === undefined) {
      target = welded.length / 3;
      lookup.set(key, target);
      welded.push(x, y, z);
    }
    remap[v] = target;
  }
  const kept: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]];
    const b = remap[indices[i + 1]];
    const c = remap[indices[i + 2]];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  return { positions: Float32Array.from(welded), indices: Uint32Array.from(kept) };
}

/**
 * Simplifies groups so their total triangles fit `budget`, giving each group a share
 * proportional to its triangle count. Returns null if meshoptimizer cannot get there.
 */
export async function simplifyToBudget(groups: readonly ColorGroup[], budget: number): Promise<ColorGroup[] | null> {
  const total = triangleCount(groups);
  if (total <= budget) return [...groups];
  await MeshoptSimplifier.ready;

  const result: ColorGroup[] = [];
  for (const group of groups) {
    const triangles = group.indices.length / 3;
    const target = Math.max(Math.min(triangles, 12), Math.floor((budget * triangles) / total));
    const simplified = simplifyGroup(group, target);
    if (!simplified) return null;
    result.push(simplified);
  }
  return triangleCount(result) <= budget ? result : null;
}

function simplifyGroup(group: ColorGroup, targetTriangles: number): ColorGroup | null {
  if (group.indices.length / 3 <= targetTriangles) return group;
  const attempts: { error: number; flags: ("Prune" | "LockBorder")[] }[] = [
    { error: 0.01, flags: [] },
    { error: 0.05, flags: [] },
    { error: 0.2, flags: ["Prune"] },
    { error: 1, flags: ["Prune"] },
  ];
  for (const { error, flags } of attempts) {
    const [indices] = MeshoptSimplifier.simplify(group.indices, group.positions, 3, targetTriangles * 3, error, flags);
    if (indices.length / 3 <= targetTriangles && indices.length > 0) return { ...group, ...compact(group.positions, indices) };
  }
  return null;
}

/** Drops vertices no triangle uses. */
export function compact(positions: Float32Array, indices: Uint32Array) {
  const remap = new Map<number, number>();
  const out = new Uint32Array(indices.length);
  const kept: number[] = [];
  for (let i = 0; i < indices.length; i += 1) {
    let next = remap.get(indices[i]);
    if (next === undefined) {
      next = remap.size;
      remap.set(indices[i], next);
      kept.push(positions[indices[i] * 3], positions[indices[i] * 3 + 1], positions[indices[i] * 3 + 2]);
    }
    out[i] = next;
  }
  return { positions: Float32Array.from(kept), indices: out };
}

/** Recomputes normals with hard edges above 30°, sharing vertices where the surface is smooth. */
export function withNormals(group: ColorGroup): FinalGroup {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(group.positions, 3));
  geometry.setIndex(new BufferAttribute(group.indices, 1));
  const creased = mergeVertices(toCreasedNormals(geometry, CREASE_ANGLE), 1e-6);
  const index = creased.getIndex()!;
  const result: FinalGroup = {
    ...group,
    positions: Float32Array.from(creased.getAttribute("position").array as ArrayLike<number>),
    normals: Float32Array.from(creased.getAttribute("normal").array as ArrayLike<number>),
    indices: Uint32Array.from(index.array as ArrayLike<number>),
  };
  geometry.dispose();
  creased.dispose();
  return result;
}

function colorDistance(a: Pick<MeshPart, "color" | "alpha">, b: Pick<MeshPart, "color" | "alpha">): number {
  const [ar, ag, ab] = a.color;
  const [br, bg, bb] = b.color;
  return Math.hypot(ar - br, ag - bg, ab - bb, a.alpha - b.alpha);
}

function weight(parts: readonly MeshPart[]): number {
  return parts.reduce((sum, part) => sum + part.indices.length, 0);
}
