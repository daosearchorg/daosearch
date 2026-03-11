import { NextRequest } from "next/server";
import { getBookComments } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return apiError("INVALID_ID", "Book ID must be a number", 400);
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  try {
    const result = await getBookComments(bookId, page);
    return apiSuccess(result.items, { page, totalPages: result.totalPages, total: result.total });
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch comments", 500);
  }
}
