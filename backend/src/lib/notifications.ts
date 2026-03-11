import { db } from "@/db";
import { notifications, notificationPreferences } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

async function isNotificationEnabled(userId: number, type: string): Promise<boolean> {
  const [pref] = await db
    .select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.type, type)))
    .limit(1);
  return pref ? pref.enabled : true;
}

export async function createNotification(params: {
  userId: number;
  actorId?: number | null;
  type: string;
  metadata: Record<string, unknown>;
}) {
  if (params.actorId && params.actorId === params.userId) return;
  if (!(await isNotificationEnabled(params.userId, params.type))) return;
  await db.insert(notifications).values({
    userId: params.userId,
    actorId: params.actorId ?? null,
    type: params.type,
    metadata: JSON.stringify(params.metadata),
  });
}

export async function createNotificationsBulk(
  rows: Array<{
    userId: number;
    actorId?: number | null;
    type: string;
    metadata: Record<string, unknown>;
  }>
) {
  // Filter out self-notifications
  const filtered = rows.filter((r) => !r.actorId || r.actorId !== r.userId);
  if (filtered.length === 0) return;

  // Batch-check preferences for all target userIds
  const userIds = [...new Set(filtered.map((r) => r.userId))];
  const type = filtered[0].type;

  const disabledPrefs = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(
      and(
        inArray(notificationPreferences.userId, userIds),
        eq(notificationPreferences.type, type),
        eq(notificationPreferences.enabled, false)
      )
    );

  const disabledSet = new Set(disabledPrefs.map((p) => p.userId));
  const toInsert = filtered
    .filter((r) => !disabledSet.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      actorId: r.actorId ?? null,
      type: r.type,
      metadata: JSON.stringify(r.metadata),
    }));

  if (toInsert.length === 0) return;

  // Insert in chunks of 1000
  for (let i = 0; i < toInsert.length; i += 1000) {
    await db.insert(notifications).values(toInsert.slice(i, i + 1000));
  }
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}
