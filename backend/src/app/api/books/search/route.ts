import { NextRequest, NextResponse } from "next/server";
import { quickSearchBooks } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json([]);
  }
  const results = await quickSearchBooks(q);
  return NextResponse.json(results);
}
