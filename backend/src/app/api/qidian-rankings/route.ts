import { NextResponse } from "next/server";
import { getQidianRankings } from "@/lib/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rankType = url.searchParams.get("type") || "yuepiao";
  const genreChannel = url.searchParams.get("genre") || "overall";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const data = await getQidianRankings({ rankType, genreChannel, page });
  return NextResponse.json(data);
}
