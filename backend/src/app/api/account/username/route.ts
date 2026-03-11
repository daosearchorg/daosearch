import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const username = (body.username ?? "").trim();

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-30 characters, letters, numbers, and underscores only" },
      { status: 400 },
    );
  }

  // Check uniqueness
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.publicUsername, username), ne(users.id, session.user.dbId)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  await db
    .update(users)
    .set({ publicUsername: username, updatedAt: new Date() })
    .where(eq(users.id, session.user.dbId));

  return NextResponse.json({ username });
}
