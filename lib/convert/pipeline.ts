import { Vector3 } from "three";
import type { Object3D } from "three";
import { MAX_PREVIEW_BYTES, MAX_PREVIEW_MATERIALS, MAX_PREVIEW_TRIANGLES } from "../ornaments/types.ts";
import { exceedsOrnamentLimit, sizeInches, tooBigMessage } from "../ornaments/preview-rules.ts";
import { exportPreviewGlb } from "./export.ts";
import { groupByColor, simplifyToBudget, triangleCount, withNormals } from "./geometry.ts";
import type { ColorGroup } from "./geometry.ts";
import { collectScene, partsBounds, resolveHanging, translateParts } from "./scene.ts";
import { ConvertError } from "./types.ts";
import type { ConvertResult } from "./types.ts";
import { modelUnit } from "./units.ts";

export interface ConvertOptions {
  /** Triangle budget; defaults slightly under MAX_PREVIEW_TRIANGLES to leave headroom. */
  triangleBudget?: number;
  maxBytes?: number;
}

/**
 * Converts the object Rhino3dmLoader returns into a preview .glb that follows the contract's
 * Preview format. Pure over three.js objects: Node tests drive it without the Rhino wasm.
 */
export async function convertObject(root: Object3D, options: ConvertOptions = {}): Promise<ConvertResult> {
  const budget = options.triangleBudget ?? MAX_PREVIEW_TRIANGLES - 64;
  const maxBytes = options.maxBytes ?? MAX_PREVIEW_BYTES;

  const unit = modelUnit(root.userData?.settings);
  const scene = collectScene(root, unit.metresPerUnit);
  if (scene.parts.length === 0) {
    throw new ConvertError(
      "NO_GEOMETRY",
      "This file has no meshes, surfaces, or solids to show. Curves, points, and text are not rendered.",
    );
  }

  const bounds = partsBounds(scene.parts);
  const sizeMetres = bounds.getSize(new Vector3()).toArray() as [number, number, number];
  if (exceedsOrnamentLimit(sizeMetres)) throw new ConvertError("TOO_BIG", tooBigMessage(sizeMetres));

  const hanging = resolveHanging(scene, bounds);
  translateParts(scene.parts, hanging.point.clone().negate());

  const sourceTriangles = scene.parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
  const groups = groupByColor(scene.parts, MAX_PREVIEW_MATERIALS);
  const extras = { eyelet: hanging.source, sizeInches: sizeInches(sizeMetres) };

  let result = await build(groups, budget, extras);
  if (result.glb.byteLength > maxBytes) result = await build(groups, Math.floor(budget / 2), extras);
  if (result.glb.byteLength > maxBytes) {
    throw new ConvertError(
      "PREVIEW_TOO_LARGE",
      `The optimized preview is still ${Math.ceil(result.glb.byteLength / 1024)} KiB (limit ${Math.floor(maxBytes / 1024)} KiB). Simplify the model in Rhino and try again.`,
    );
  }

  return {
    glb: result.glb,
    report: {
      eyelet: hanging.source,
      ...(hanging.warning ? { eyeletWarning: hanging.warning } : {}),
      sizeInches: extras.sizeInches,
      triangles: result.triangles,
      materials: groups.length,
      bytes: result.glb.byteLength,
      sourceTriangles,
      unit,
    },
  };
}

async function build(groups: readonly ColorGroup[], budget: number, extras: Parameters<typeof exportPreviewGlb>[1]) {
  const simplified = await simplifyToBudget(groups, budget);
  if (!simplified) {
    throw new ConvertError(
      "TOO_DETAILED",
      `This model could not be simplified to ${budget.toLocaleString("en-US")} triangles. Reduce its detail in Rhino and try again.`,
    );
  }
  const finals = simplified.map(withNormals);
  return { glb: await exportPreviewGlb(finals, extras), triangles: triangleCount(finals) };
}
