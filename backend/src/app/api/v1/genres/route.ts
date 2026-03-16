import { getPrimaryGenres } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  try {
    const genres = await getPrimaryGenres();
    return apiSuccess(genres, undefined, 3600);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch genres", 500);
  }
}
