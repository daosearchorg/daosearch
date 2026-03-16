import { getBook, getBookRecommendationsWithStats } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return apiError("INVALID_ID", "Book ID must be a number", 400);
  }

  try {
    const book = await getBook(bookId);
    if (!book) {
      return apiError("NOT_FOUND", "Book not found", 404);
    }

    const qqIds = (book.recommendationQqIds as number[]) ?? [];
    if (qqIds.length === 0) {
      return apiSuccess([]);
    }

    const recommendations = await getBookRecommendationsWithStats(qqIds);
    return apiSuccess(recommendations, undefined, 300);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch recommendations", 500);
  }
}
