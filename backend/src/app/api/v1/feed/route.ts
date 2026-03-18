import { NextRequest } from "next/server";
import { getLatestQidianComments, getDaoSearchFeed } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") || "comments";
  const page = Math.min(200, Math.max(1, Number(sp.get("page")) || 1));
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;

  try {
    if (type === "activity") {
      const result = await paginatedQuery((p) => getDaoSearchFeed(p), page, limit);
      return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 60);
    }
    const result = await paginatedQuery((p) => getLatestQidianComments(p), page, limit);
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 60);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch feed", 500);
  }
}
