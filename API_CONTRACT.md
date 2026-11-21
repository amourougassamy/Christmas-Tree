# Ornament API contract

All endpoints are public and unauthenticated. Successful JSON uses `Content-Type: application/json`; errors use `{ "error": { "code": string, "message": string } }`.

The app is self-hosted on Node (Next.js). Metadata lives in SQLite; files live on local disk. Storage keys are opaque and never exposed.

## `POST /api/ornaments`

Send `multipart/form-data` with `initials`, optional `message`, `model`, and `preview` fields. The legacy `initials` field name stores the participant's display name.

- `initials`: a display name containing 1-60 characters after trimming.
- `message`: optional participant text. Whitespace is trimmed; empty is allowed; maximum 80 characters. No default message is stored.
- `model`: the original Rhino 3DM file. Filename ends in `.3dm` (case-insensitive), has the Rhino file header, non-empty, at most 20 MiB (20,971,520 bytes). Stored for re-conversion; never rendered on the tree.
- `preview`: the optimized `.glb` produced in the uploader's browser from `model` (see **Preview format**). The server parses it and enforces every rule below.
- Returns `201 { "ornament": Ornament }`.
- Validation errors: `400 INVALID_INITIALS`, `400 INVALID_MESSAGE`, `400 MODEL_REQUIRED`, `400 EMPTY_MODEL`, `413 MODEL_TOO_LARGE`, `415 INVALID_MODEL_TYPE`, `415 INVALID_MODEL_CONTENT`, `400 PREVIEW_REQUIRED`, `415 INVALID_PREVIEW` (not a parseable glTF binary, or uses unsupported extensions), `413 PREVIEW_TOO_LARGE` (bytes, triangles, or materials over budget), `422 PREVIEW_HAS_TEXTURES`, `422 ORNAMENT_TOO_BIG` (bounding box over the 4" limit; message states the measured size in inches).

Uploads claim slots 1 through 60 in round-robin order. Claiming an occupied slot archives its current ornament; archived records remain until deleted.

## `GET /api/ornaments`

Returns `200 { "ornaments": Ornament[] }`, containing only active, non-deleted ornaments ordered by slot. Add `?include_archived=true` to include archived, non-deleted records for history/admin UI.

## `GET /api/ornaments/:id/model`

Streams the optimized `.glb` preview for an active or archived ornament. `Content-Type: model/gltf-binary`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable` (IDs are never reused and content never changes), and an ETag. Missing metadata returns `404 NOT_FOUND`; missing file returns `404 MODEL_NOT_FOUND`.

## `GET /api/ornaments/:id/source`

Streams the original `.3dm`. `Content-Type: application/octet-stream`, `Content-Length`, an inline filename, same caching. Same 404s as `/model`.

## `DELETE /api/ornaments/:id`

Soft-deletes metadata, removes both stored files, and returns `204` with no body. Deleting the active ornament in a slot restores the newest archived, non-deleted ornament in that slot. Deleting an archived ornament does not change the active ornament. Missing/already-deleted IDs return `404 NOT_FOUND`.

## `Ornament`

```ts
type Ornament = {
  id: string;
  initials: string;
  message: string;           // trimmed participant text, or empty string
  slot: number;              // integer 1-60
  originalName: string;      // original .3dm filename
  byteSize: number;          // .3dm size in bytes
  previewByteSize: number;   // .glb size in bytes
  createdAt: string;         // ISO 8601 UTC
  archivedAt: string | null; // null means active
  modelUrl: string;          // same-origin .glb endpoint
  sourceUrl: string;         // same-origin .3dm endpoint
};
```

## Preview format (`.glb`)

Shared between the browser converter (writer), the server validator, and the tree renderer (reader). Constants live in `lib/ornaments/types.ts`.

- glTF 2.0 binary (`.glb`), at most `MAX_PREVIEW_BYTES` (512 KiB).
- **Real-world size, one scale for every ornament.** Units are metres (glTF standard), converted from the Rhino file's model unit system. Rhino files with no unit system are treated as inches. Every ornament must fit within a 4" × 4" × 4" box (`MAX_ORNAMENT_INCHES`, 0.1016 m per side) with 5% tolerance (`ORNAMENT_SIZE_TOLERANCE`): each bounding-box side ≤ 0.10668 m. Nothing is rescaled to fit.
- **Y-up.** Rhino's Z-up is rotated to Y-up.
- **Hanging origin.** The origin is the hanging point: the bounding box is centred on X and Z, and its highest point sits at Y = 0, so the ornament extends downward (all Y ≤ 0).
- Triangle meshes only (no lines or points), at most `MAX_PREVIEW_TRIANGLES` (8,000) triangles total, at most `MAX_PREVIEW_MATERIALS` (4) materials, one mesh primitive per material.
- Materials are `KHR`-core PBR metallic-roughness with base colour factors only. **No textures or images.**
- Allowed extensions: `EXT_meshopt_compression`, `KHR_mesh_quantization`. The reader registers the meshopt decoder.
- Tree mapping: the renderer applies one constant `SCENE_UNITS_PER_METRE` so that a 4" ornament spans the tree's standard ornament size; smaller ornaments stay proportionally smaller.
