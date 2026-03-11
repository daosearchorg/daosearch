import { NextResponse } from "next/server";
import { getRankings } from "@/lib/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gender = url.searchParams.get("gender") || "male";
  const rankType = url.searchParams.get("type") || "popular";
  const cycle = url.searchParams.get("cycle") || "cycle-1";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const data = await getRankings({ gender, rankType, cycle, page });
  return NextResponse.json(data);
}
