import { NextRequest } from "next/server";
import { getQidianBooklistDetail } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const booklistId = Number(id);
  if (isNaN(booklistId)) {
    return apiError("INVALID_ID", "Booklist ID must be a number", 400);
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  try {
    const result = await getQidianBooklistDetail(booklistId, page);
    if (!result) {
      return apiError("NOT_FOUND", "Booklist not found", 404);
    }
    return apiSuccess(
      { booklist: result.booklist, items: result.items },
      { page, totalPages: result.totalPages, total: result.total },
    );
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch booklist", 500);
  }
}
