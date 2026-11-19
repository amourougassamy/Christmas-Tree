import { deleteResponse } from "@/lib/ornaments/http";
import { getOrnamentService } from "@/lib/ornaments/runtime";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return deleteResponse(id, getOrnamentService());
}
