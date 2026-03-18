import { NextRequest } from "next/server";
import { getQidianBooklists, type QidianBooklistSort } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";

const VALID_SORTS = ["popular", "recent", "largest"] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.min(200, Math.max(1, Number(sp.get("page")) || 1));
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;
  const sortParam = sp.get("sort") || "popular";
  const sort = (VALID_SORTS.includes(sortParam as QidianBooklistSort) ? sortParam : "popular") as QidianBooklistSort;

  try {
    const result = await paginatedQuery(
      (p) => getQidianBooklists({ page: p, sort }),
      page,
      limit,
    );
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 300);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch booklists", 500);
  }
}
