import { auth } from "@/auth";
import { db } from "@/db";
import { reviewReplies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ replyId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { replyId } = await params;
  const id = Number(replyId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reply ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const replyText = typeof body.replyText === "string" ? body.replyText.trim() : "";
  if (replyText.length < 1 || replyText.length > 2000) {
    return NextResponse.json({ error: "Reply must be 1-2000 characters" }, { status: 400 });
  }

  const updated = await db
    .update(reviewReplies)
    .set({ replyText, updatedAt: new Date() })
    .where(and(eq(reviewReplies.id, id), eq(reviewReplies.userId, session.user.dbId)))
    .returning({ id: reviewReplies.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
  }

  return NextResponse.json({ id, replyText });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { replyId } = await params;
  const id = Number(replyId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid reply ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(reviewReplies)
    .where(and(eq(reviewReplies.id, id), eq(reviewReplies.userId, session.user.dbId)));

  return NextResponse.json({ success: true });
}
