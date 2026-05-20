import { NextRequest } from "next/server";
import { getQidianBooklists } from "@/lib/queries";
import {
  BOOKLIST_SORT_OPTIONS,
  BOOKLIST_UPDATED_WITHIN_VALUES,
  type BooklistSort,
} from "@/lib/constants";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";

const VALID_SORTS = new Set<BooklistSort>(BOOKLIST_SORT_OPTIONS.map((o) => o.value));

function parseIntParam(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.min(200, Math.max(1, Number(sp.get("page")) || 1));
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;

  const sortRaw = sp.get("sort") as BooklistSort | null;
  const sort: BooklistSort = sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : "popular";
  const order = sp.get("order") === "asc" ? ("asc" as const) : ("desc" as const);

  const name = sp.get("name")?.trim() || undefined;

  const qtagRaw = sp.get("qtag");
  const qidianTags = qtagRaw
    ? qtagRaw.split(",").map((t) => decodeURIComponent(t).trim()).filter(Boolean).slice(0, 20)
    : undefined;

  const minFollowers = parseIntParam(sp.get("minF"));
  const maxFollowers = parseIntParam(sp.get("maxF"));
  const minBookCount = parseIntParam(sp.get("minB"));
  const maxBookCount = parseIntParam(sp.get("maxB"));
  const withinRaw = parseIntParam(sp.get("within"));
  const updatedWithin = withinRaw != null && BOOKLIST_UPDATED_WITHIN_VALUES.has(withinRaw) ? withinRaw : undefined;

  try {
    const result = await paginatedQuery(
      (p) => getQidianBooklists({
        page: p,
        sort,
        order,
        name,
        tags: qidianTags,
        minFollowers,
        maxFollowers,
        minBookCount,
        maxBookCount,
        updatedWithin,
      }),
      page,
      limit,
    );
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total }, 300);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch booklists", 500);
  }
}
