import { listResponse, uploadResponse } from "@/lib/ornaments/http";
import { getOrnamentService } from "@/lib/ornaments/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return listResponse(request, getOrnamentService());
}

export async function POST(request: Request) {
  return uploadResponse(request, getOrnamentService());
}
