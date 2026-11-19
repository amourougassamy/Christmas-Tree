# Ornament API contract

All endpoints are public and unauthenticated. Successful JSON uses `Content-Type: application/json`; errors use `{ "error": { "code": string, "message": string } }`.

## `POST /api/ornaments`

Send `multipart/form-data` with `initials` and `model` fields.

- `initials`: exactly 1-4 uppercase ASCII letters (`^[A-Z]{1,4}$`).
- `model`: a non-empty file whose filename ends in `.3dm` (case-insensitive), no larger than 10 MiB (10,485,760 bytes).
- Returns `201 { "ornament": Ornament }`.
- Validation errors: `400 INVALID_INITIALS`, `400 MODEL_REQUIRED`, `400 EMPTY_MODEL`, `413 MODEL_TOO_LARGE`, or `415 INVALID_MODEL_TYPE`.

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
  slot: number;              // integer 1-60
  originalName: string;
  byteSize: number;
  createdAt: string;         // ISO 8601 UTC
  archivedAt: string | null; // null means active
  modelUrl: string;          // same-origin stream endpoint
};
```

R2 object keys and deletion timestamps are never exposed. `.openai/hosting.json` declares D1 as `DB` and R2 as `BUCKET`; `project_id` is intentionally absent until Sites registration.
