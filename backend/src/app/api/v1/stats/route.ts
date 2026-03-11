import { getDbStats } from "@/lib/queries";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  try {
    const stats = await getDbStats();
    return apiSuccess(stats);
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to fetch stats", 500);
  }
}
