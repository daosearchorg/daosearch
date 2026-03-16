import { NextRequest } from "next/server";
import { getRankings } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const gender = sp.get("gender") || "male";
  const rankType = sp.get("type") || "popular";
  const cycle = sp.get("cycle") || "cycle-1";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;
  const genreId = sp.get("genre") ? Number(sp.get("genre")) : undefined;

  try {
    const result = await paginatedQuery(
      (p) => getRankings({ gender, rankType, cycle, page: p, genreId }),
      page,
      limit,
    );
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 300);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch rankings", 500);
  }
}
