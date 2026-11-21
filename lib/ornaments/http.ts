import { OrnamentService } from "./service.ts";
import { isApiError } from "./validation.ts";

export async function uploadResponse(request: Request, service: OrnamentService): Promise<Response> {
  try {
    const form = await request.formData();
    const ornament = await service.upload(
      form.get("initials"),
      form.get("message"),
      form.get("model"),
      form.get("preview"),
    );
    return Response.json({ ornament }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function listResponse(request: Request, service: OrnamentService): Promise<Response> {
  try {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "true";
    return Response.json({ ornaments: await service.list(includeArchived) });
  } catch (error) {
    return errorResponse(error);
  }
}

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** Streams the optimized .glb preview the tree renders. */
export async function modelResponse(id: string, service: OrnamentService): Promise<Response> {
  try {
    const { record, model } = await service.model(id);
    const headers = new Headers({
      "content-type": "model/gltf-binary",
      "content-length": String(model.size),
      "content-disposition": `inline; filename="${safeFilename(glbName(record.originalName))}"`,
      "cache-control": IMMUTABLE_CACHE,
    });
    if (model.etag) headers.set("etag", model.etag);
    return new Response(model.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Streams the original .3dm. */
export async function sourceResponse(id: string, service: OrnamentService): Promise<Response> {
  try {
    const { record, model } = await service.source(id);
    const headers = new Headers({
      "content-type": "application/octet-stream",
      "content-length": String(model.size),
      "content-disposition": `inline; filename="${safeFilename(record.originalName)}"`,
      "cache-control": IMMUTABLE_CACHE,
    });
    if (model.etag) headers.set("etag", model.etag);
    return new Response(model.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function deleteResponse(id: string, service: OrnamentService): Promise<Response> {
  try {
    await service.delete(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown): Response {
  if (isApiError(error)) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

function glbName(originalName: string): string {
  return `${originalName.replace(/\.3dm$/i, "") || "ornament"}.glb`;
}

function safeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}
