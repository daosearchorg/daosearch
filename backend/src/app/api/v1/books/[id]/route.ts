import { getBook, getBookStats } from "@/lib/queries";
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
    const [book, stats] = await Promise.all([getBook(bookId), getBookStats(bookId)]);
    if (!book) {
      return apiError("NOT_FOUND", "Book not found", 404);
    }
    return apiSuccess({ ...book, stats }, undefined, 60);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch book", 500);
  }
}
