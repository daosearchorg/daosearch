import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { uploadAvatar, deleteAvatar } from "@/lib/storage";

const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, GIF, and WebP images are allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Image must be under 1 MB" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate magic bytes match declared MIME type
  const magicBytes: Record<string, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/gif": [0x47, 0x49, 0x46, 0x38],
    "image/webp": [0x52, 0x49, 0x46, 0x46],
  };

  const expected = magicBytes[file.type];
  if (expected && !expected.every((b, i) => buffer[i] === b)) {
    return NextResponse.json(
      { error: "File content does not match declared image type" },
      { status: 400 },
    );
  }

  // Delete old avatar if it's on our bucket
  const [current] = await db
    .select({ publicAvatarUrl: users.publicAvatarUrl })
    .from(users)
    .where(eq(users.id, session.user.dbId))
    .limit(1);

  if (current?.publicAvatarUrl?.includes("bucket.daosearch.io")) {
    await deleteAvatar(current.publicAvatarUrl).catch(() => {});
  }

  const url = await uploadAvatar(session.user.dbId, buffer, file.type);

  await db
    .update(users)
    .set({ publicAvatarUrl: url, updatedAt: new Date() })
    .where(eq(users.id, session.user.dbId));

  return NextResponse.json({ url });
}
