import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  // Escape special LIKE chars
  const escaped = q.replace(/[%_\\]/g, "\\$&");

  const results = await db
    .select({
      id: users.id,
      publicUsername: users.publicUsername,
      publicAvatarUrl: users.publicAvatarUrl,
    })
    .from(users)
    .where(sql`${users.publicUsername} ILIKE ${escaped + "%"}`)
    .limit(5);

  return NextResponse.json({ users: results });
}
