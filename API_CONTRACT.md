# Ornament API contract

All endpoints are public and unauthenticated. Successful JSON uses `Content-Type: application/json`; errors use `{ "error": { "code": string, "message": string } }`.

The app is self-hosted on Node (Next.js). Metadata lives in SQLite; files live on local disk. Storage keys are opaque and never exposed.

## `POST /api/ornaments`

Send `multipart/form-data` with `initials`, optional `message`, and `model` fields. The legacy `initials` field name stores the participant's display name.

- `initials`: a display name containing 1-60 characters after trimming.
- `message`: optional participant text. Whitespace is trimmed; empty is allowed; maximum 80 characters. No default message is stored.
- `model`: one non-empty GLB 2.0 file with a `.glb` filename (case-insensitive), at most 512 KiB (524,288 bytes). It must meet the format rules below. The original is stored unchanged; a second GLB is generated with its top centre at the hanging origin.
- There is no separate `preview` upload. The server validates and prepares the model itself before claiming a slot.
- Returns `201 { "ornament": Ornament }`.
- Validation errors: `400 INVALID_INITIALS`, `400 INVALID_MESSAGE`, `400 MODEL_REQUIRED`, `400 EMPTY_MODEL`, `413 MODEL_TOO_LARGE`, `415 INVALID_MODEL_TYPE`, `415 INVALID_MODEL_CONTENT`, `415 INVALID_PREVIEW` (not a parseable glTF binary, or uses unsupported extensions), `413 PREVIEW_TOO_LARGE` (bytes, triangles, or materials over budget), `422 PREVIEW_HAS_TEXTURES`, `422 ORNAMENT_TOO_BIG` (bounding box over the 4" limit; message states the measured size in inches).

Uploads claim slots 1 through 60 in round-robin order. Claiming an occupied slot archives its current ornament; archived records remain until deleted.

## `GET /api/ornaments`

Returns `200 { "ornaments": Ornament[] }`, containing only active, non-deleted ornaments ordered by slot. Add `?include_archived=true` to include archived, non-deleted records for history/admin UI.

## `GET /api/ornaments/:id/model`

Streams the optimized `.glb` preview for an active or archived ornament. `Content-Type: model/gltf-binary`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable` (IDs are never reused and content never changes), and an ETag. Missing metadata returns `404 NOT_FOUND`; missing file returns `404 MODEL_NOT_FOUND`.

## `GET /api/ornaments/:id/source`

Streams the original uploaded `.glb`. `Content-Type: model/gltf-binary` (legacy `.3dm` sources retain `application/octet-stream`), `Content-Length`, an inline filename, same caching. Same 404s as `/model`.

## `DELETE /api/ornaments/:id`

Soft-deletes metadata, removes both stored files, and returns `204` with no body. Deleting the active ornament in a slot restores the newest archived, non-deleted ornament in that slot. Deleting an archived ornament does not change the active ornament. Missing/already-deleted IDs return `404 NOT_FOUND`.

## `Ornament`

```ts
type Ornament = {
  id: string;
  initials: string;
  message: string;           // trimmed participant text, or empty string
  slot: number;              // integer 1-60
  originalName: string;      // original upload filename
  byteSize: number;          // original file size in bytes
  previewByteSize: number;   // .glb size in bytes
  createdAt: string;         // ISO 8601 UTC
  archivedAt: string | null; // null means active
  modelUrl: string;          // same-origin .glb endpoint
  sourceUrl: string;         // same-origin original-file endpoint
};
```

## Preview format (`.glb`)

Shared between browser checks, server validation, and the tree renderer. Constants live in `lib/ornaments/types.ts`.

- glTF 2.0 binary (`.glb`), at most `MAX_MODEL_BYTES` / `MAX_PREVIEW_BYTES` (512 KiB for both the original and prepared GLB).
- **Real-world size, one scale for every ornament.** Units are metres (glTF standard). Geometry must fit within a 4" × 4" × 4" box (`MAX_ORNAMENT_INCHES`, 0.1016 m per side) with 5% tolerance: each bounding-box side ≤ 0.10668 m. Nothing is rescaled to fit. Rhino export must map Z-up to glTF Y-up.
- **Hanging origin = top centre.** The app measures world-space mesh bounds and wraps the scene roots in a translation: centre X and Z, highest Y at zero. The renderer places this origin at the branch's hanging point. No Rhino eyelet layer or point is required. The browser and server independently prepare the same uploaded source bytes.
- Static meshes only; animations and skinned meshes are rejected.
- Triangle meshes only (no lines or points), at most `MAX_PREVIEW_TRIANGLES` (8,000) triangles total, at most `MAX_PREVIEW_MATERIALS` (4) materials.
- Materials are `KHR`-core PBR metallic-roughness with base colour factors only. **No textures or images.**
- Allowed extensions: `EXT_meshopt_compression`, `KHR_mesh_quantization`. The reader registers the meshopt decoder.
- Tree mapping: the renderer applies one constant `SCENE_UNITS_PER_METRE` so that a 4" ornament spans the tree's standard ornament size; smaller ornaments stay proportionally smaller.
