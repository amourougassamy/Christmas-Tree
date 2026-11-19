import { OrnamentService } from "./service.ts";
import { ApiError } from "./validation.ts";

export async function uploadResponse(request: Request, service: OrnamentService): Promise<Response> {
  try {
    const form = await request.formData();
    const ornament = await service.upload(form.get("initials"), form.get("message"), form.get("model"));
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

export async function modelResponse(id: string, service: OrnamentService): Promise<Response> {
  try {
    const { record, model } = await service.model(id);
    const headers = new Headers({
      "content-type": "application/octet-stream",
      "content-length": String(model.size),
      "content-disposition": `inline; filename="${safeFilename(record.originalName)}"`,
      "cache-control": "public, max-age=3600",
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
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

function safeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}
