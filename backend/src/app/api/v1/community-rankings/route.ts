import { NextRequest } from "next/server";
import { getCommunityRankings, type CommunityPeriod } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";

const VALID_PERIODS = ["daily", "weekly", "monthly", "all-time"] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;
  const periodParam = sp.get("period") || "all-time";
  const period = (VALID_PERIODS.includes(periodParam as CommunityPeriod) ? periodParam : "all-time") as CommunityPeriod;
  const genreId = sp.get("genre") ? Number(sp.get("genre")) : undefined;

  try {
    const result = await paginatedQuery(
      (p) => getCommunityRankings({ period, page: p, genreId }),
      page,
      limit,
    );
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 300);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch community rankings", 500);
  }
}
