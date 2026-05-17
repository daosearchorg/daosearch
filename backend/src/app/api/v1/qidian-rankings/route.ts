import { NextRequest } from "next/server";
import { getQidianRankings } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";
import { QIDIAN_RANK_TYPES, QIDIAN_GENRE_CHANNELS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.min(200, Math.max(1, Number(sp.get("page")) || 1));
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;
  const typeParam = sp.get("type") || "yuepiao";
  const rankType = (QIDIAN_RANK_TYPES as readonly string[]).includes(typeParam) ? typeParam : "yuepiao";
  const genreParam = sp.get("genre") || "overall";
  const genreChannel = (QIDIAN_GENRE_CHANNELS as readonly string[]).includes(genreParam) ? genreParam : "overall";

  try {
    const result = await paginatedQuery(
      (p) => getQidianRankings({ rankType, genreChannel, page: p }),
      page,
      limit,
    );
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 300);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch qidian rankings", 500);
  }
}
