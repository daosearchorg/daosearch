import { getCommunityBooklists } from "@/lib/queries";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = (searchParams.get("sort") || "recent") as
    | "popular"
    | "recent"
    | "largest";
  const page = Number(searchParams.get("page")) || 1;

  const result = await getCommunityBooklists({ page, sort });

  return NextResponse.json(result);
}
