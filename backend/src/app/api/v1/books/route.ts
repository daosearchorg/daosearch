import { NextRequest } from "next/server";
import { getLibraryBooks } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";
import { paginatedQuery } from "@/lib/api-paginate";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = sp.get("limit") ? Math.min(50, Math.max(1, Number(sp.get("limit")))) : undefined;
  const name = sp.get("q") || undefined;
  const author = sp.get("author") || undefined;
  const genreId = sp.get("genre") ? Number(sp.get("genre")) : undefined;
  const subgenreId = sp.get("subgenre") ? Number(sp.get("subgenre")) : undefined;
  const sort = sp.get("sort") || "updated";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  const status = sp.get("status") || undefined;
  const gender = sp.get("gender") || undefined;
  const minWords = sp.get("minWords") ? Number(sp.get("minWords")) : undefined;
  const maxWords = sp.get("maxWords") ? Number(sp.get("maxWords")) : undefined;

  try {
    const result = await paginatedQuery(
      (p) => getLibraryBooks({ name, author, genreId, subgenreId, sort: sort as "updated", order, status, gender, minWords, maxWords, page: p }),
      page,
      limit,
    );
    return apiSuccess(result.items, { page: result.page, totalPages: result.totalPages, total: result.total });
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch books", 500);
  }
}
