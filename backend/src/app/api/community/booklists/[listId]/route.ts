import { auth } from "@/auth";
import { getCommunityBooklistDetail } from "@/lib/queries";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ listId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const { searchParams } = new URL(_request.url);
  const page = Number(searchParams.get("page")) || 1;

  const session = await auth();
  const currentUserId = session?.user?.dbId ?? undefined;

  const result = await getCommunityBooklistDetail(id, page, currentUserId);

  if (!result) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
