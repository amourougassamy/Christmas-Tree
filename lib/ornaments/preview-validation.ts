import { Primitive } from "@gltf-transform/core";
import { ALLOWED_PREVIEW_EXTENSIONS, previewIO } from "./gltf-io.ts";
import { exceedsOrnamentLimit, tooBigMessage } from "./preview-rules.ts";
import { MAX_PREVIEW_BYTES, MAX_PREVIEW_MATERIALS, MAX_PREVIEW_TRIANGLES } from "./types.ts";
import { ApiError } from "./validation.ts";

export interface PreviewStats {
  boundsMetres: [[number, number, number], [number, number, number]];
  triangles: number;
  materials: number;
  /** World-space bounding-box size in metres, [x, y, z]. */
  sizeMetres: [number, number, number];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

/**
 * Enforces every Preview format rule from API_CONTRACT.md on uploaded .glb bytes.
 * Measures the geometry itself; `asset.extras` is never trusted.
 */
export async function validatePreview(bytes: Uint8Array): Promise<PreviewStats> {
  if (bytes.byteLength > MAX_PREVIEW_BYTES) {
    throw new ApiError(413, "PREVIEW_TOO_LARGE", `The preview cannot exceed ${MAX_PREVIEW_BYTES / 1024} KiB.`);
  }
  const json = readGlbJson(bytes);

  const extensions = new Set([...asStrings(json.extensionsUsed), ...asStrings(json.extensionsRequired)]);
  const unsupported = [...extensions].filter((name) => !ALLOWED_PREVIEW_EXTENSIONS.includes(name));
  if (unsupported.length > 0) {
    throw invalid(`The preview uses unsupported glTF extensions: ${unsupported.join(", ")}.`);
  }
  if (count(json.images) > 0 || count(json.textures) > 0 || count(json.samplers) > 0) {
    throw new ApiError(422, "PREVIEW_HAS_TEXTURES", "The preview cannot contain textures or images.");
  }
  if (Array.isArray(json.buffers) && json.buffers.some((buffer) => buffer && typeof buffer === "object" && "uri" in buffer)) {
    throw invalid("The preview must be a self-contained .glb with no external buffers.");
  }

  let document;
  try {
    document = await (await previewIO()).readBinary(bytes);
  } catch {
    throw invalid("The preview is not a valid glTF binary.");
  }
  const root = document.getRoot();

  if (root.listAnimations().length || root.listSkins().length) {
    throw invalid("Export a static ornament without animations or skinned meshes.");
  }
  const materials = root.listMaterials().length;
  if (materials > MAX_PREVIEW_MATERIALS) {
    throw new ApiError(413, "PREVIEW_TOO_LARGE", `The preview has ${materials} materials; at most ${MAX_PREVIEW_MATERIALS} are allowed.`);
  }

  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== Primitive.Mode.TRIANGLES) throw invalid("The preview may only contain triangle meshes.");
      const position = primitive.getAttribute("POSITION");
      if (!position) throw invalid("A preview mesh has no positions.");
      const indices = primitive.getIndices();
      const vertices = indices ? indices.getCount() : position.getCount();
      if (vertices % 3 !== 0) throw invalid("A preview mesh has an incomplete triangle.");
      triangles += vertices / 3;
    }
  }
  if (triangles === 0) throw invalid("The preview has no triangles.");

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let instancedTriangles = 0;
  for (const scene of root.listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const matrix = node.getWorldMatrix();
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute("POSITION")!;
        const indices = primitive.getIndices();
        instancedTriangles += (indices ? indices.getCount() : position.getCount()) / 3;
        const element: number[] = [0, 0, 0];
        for (let i = 0; i < position.getCount(); i += 1) {
          position.getElement(i, element);
          const [x, y, z] = element;
          const world = [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
          ];
          for (let axis = 0; axis < 3; axis += 1) {
            if (!Number.isFinite(world[axis])) throw invalid("The preview has invalid vertex positions.");
            if (world[axis] < min[axis]) min[axis] = world[axis];
            if (world[axis] > max[axis]) max[axis] = world[axis];
          }
        }
      }
    });
  }
  triangles = Math.max(triangles, instancedTriangles);
  if (triangles > MAX_PREVIEW_TRIANGLES) {
    throw new ApiError(
      413,
      "PREVIEW_TOO_LARGE",
      `The preview has ${triangles.toLocaleString("en-US")} triangles; at most ${MAX_PREVIEW_TRIANGLES.toLocaleString("en-US")} are allowed.`,
    );
  }
  if (!Number.isFinite(min[0])) throw invalid("The preview scene has no visible meshes.");

  const sizeMetres = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as [number, number, number];
  if (exceedsOrnamentLimit(sizeMetres)) throw new ApiError(422, "ORNAMENT_TOO_BIG", tooBigMessage(sizeMetres));

  return { triangles, materials, sizeMetres, boundsMetres: [min as [number, number, number], max as [number, number, number]] };
}

function readGlbJson(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength < 20) throw invalid("The preview is not a glTF binary (.glb).");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw invalid("The preview is not a glTF binary (.glb).");
  if (view.getUint32(4, true) !== 2) throw invalid("The preview must be glTF 2.0.");
  const declaredLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  if (declaredLength > bytes.byteLength || view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    throw invalid("The preview .glb is truncated or malformed.");
  }
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("not an object");
    return json as Record<string, unknown>;
  } catch {
    throw invalid("The preview .glb has an unreadable JSON chunk.");
  }
}

function invalid(message: string): ApiError {
  return new ApiError(415, "INVALID_PREVIEW", message);
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
