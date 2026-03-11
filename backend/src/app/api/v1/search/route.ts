import { NextRequest } from "next/server";
import { quickSearchBooks } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return apiSuccess([]);
  }

  try {
    const results = await quickSearchBooks(q);
    return apiSuccess(results);
  } catch {
    return apiError("INTERNAL_ERROR", "Search failed", 500);
  }
}
