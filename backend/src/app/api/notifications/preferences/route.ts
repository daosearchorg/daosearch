import { auth } from "@/auth";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { NOTIFICATION_TYPE_KEYS } from "@/lib/notification-types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await db
    .select({ type: notificationPreferences.type, enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, session.user.dbId));

  const prefMap = new Map(prefs.map((p) => [p.type, p.enabled]));

  const result = NOTIFICATION_TYPE_KEYS.map((type) => ({
    type,
    enabled: prefMap.has(type) ? prefMap.get(type)! : true,
  }));

  return NextResponse.json({ preferences: result });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, enabled } = body;

  if (typeof type !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!NOTIFICATION_TYPE_KEYS.includes(type)) {
    return NextResponse.json({ error: "Unknown notification type" }, { status: 400 });
  }

  await db
    .insert(notificationPreferences)
    .values({ userId: session.user.dbId, type, enabled })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: { enabled },
    });

  return NextResponse.json({ success: true });
}
