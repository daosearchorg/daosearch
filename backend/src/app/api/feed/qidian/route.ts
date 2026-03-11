import { NextResponse } from "next/server";
import { getLatestQidianComments } from "@/lib/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const data = await getLatestQidianComments(page);
  return NextResponse.json(data);
}
