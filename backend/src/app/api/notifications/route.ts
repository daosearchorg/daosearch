import { auth } from "@/auth";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq, and, lt, desc, count } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = Number(searchParams.get("cursor")) || 0;
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

  const conditions = [eq(notifications.userId, session.user.dbId)];
  if (cursor > 0) {
    conditions.push(lt(notifications.id, cursor));
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      metadata: notifications.metadata,
      read: notifications.read,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
      actorUsername: users.publicUsername,
      actorAvatarUrl: users.publicAvatarUrl,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => ({
    ...r,
    metadata: JSON.parse(r.metadata),
  }));

  const [unreadRow] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.dbId), eq(notifications.read, false)));

  return NextResponse.json({
    notifications: items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    unreadCount: unreadRow.count,
  });
}
