# Ornament API contract

All endpoints are public and unauthenticated. Successful JSON uses `Content-Type: application/json`; errors use `{ "error": { "code": string, "message": string } }`.

## `POST /api/ornaments`

Send `multipart/form-data` with `initials`, optional `message`, and `model` fields. The legacy `initials` field name stores the participant's display name.

- `initials`: a display name containing 1-60 characters after trimming.
- `message`: optional participant text. Whitespace is trimmed; empty is allowed; maximum 80 characters. No default message is stored.
- `model`: a non-empty Rhino 3DM file whose filename ends in `.3dm` (case-insensitive), has the Rhino file header, and is no larger than 20 MiB (20,971,520 bytes).
- Returns `201 { "ornament": Ornament }`.
- Validation errors: `400 INVALID_INITIALS`, `400 INVALID_MESSAGE`, `400 MODEL_REQUIRED`, `400 EMPTY_MODEL`, `413 MODEL_TOO_LARGE`, or `415 INVALID_MODEL_TYPE`, or `415 INVALID_MODEL_CONTENT`.

Uploads claim slots 1 through 60 in round-robin order. Claiming an occupied slot archives its current ornament; archived models remain available until deleted.

## `GET /api/ornaments`

Returns `200 { "ornaments": Ornament[] }`, containing only active, non-deleted ornaments ordered by slot. Add `?include_archived=true` to include archived, non-deleted records for history/admin UI.

## `GET /api/ornaments/:id/model`

Streams the `.3dm` bytes for an active or archived ornament. Returns `application/octet-stream`, `Content-Length`, an inline filename, and an ETag when R2 provides one. Missing metadata returns `404 NOT_FOUND`; missing R2 data returns `404 MODEL_NOT_FOUND`.

## `DELETE /api/ornaments/:id`

Soft-deletes metadata, removes its R2 object, and returns `204` with no body. Deleting the active ornament in a slot restores the newest archived, non-deleted ornament in that slot. Deleting an archived ornament does not change the active ornament. Missing/already-deleted IDs return `404 NOT_FOUND`.

## `Ornament`

```ts
type Ornament = {
  id: string;
  initials: string;
  message: string;        // trimmed participant text, or empty string
  slot: number;              // integer 1-60
  originalName: string;
  byteSize: number;
  createdAt: string;         // ISO 8601 UTC
  archivedAt: string | null; // null means active
  modelUrl: string;          // same-origin stream endpoint
};
```

R2 object keys and deletion timestamps are never exposed. `.openai/hosting.json` declares D1 as `DB` and R2 as `BUCKET`; `project_id` is intentionally absent until Sites registration.
