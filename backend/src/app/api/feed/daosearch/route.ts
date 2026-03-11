import { NextRequest, NextResponse } from "next/server";
import { getDaoSearchFeed } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const { items, total } = await getDaoSearchFeed(page);
  return NextResponse.json({ items, total });
}
