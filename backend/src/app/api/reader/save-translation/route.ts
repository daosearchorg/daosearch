import { auth } from "@/auth";
import { db } from "@/db";
import { translatedChapters } from "@/db/schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookId, chapterSeq, translatedTitle, translatedText, sourceDomain } = body;

  if (!bookId || chapterSeq == null) {
    return NextResponse.json(
      { error: "bookId and chapterSeq are required" },
      { status: 400 },
    );
  }

  await db
    .insert(translatedChapters)
    .values({
      userId: session.user.dbId,
      bookId: Number(bookId),
      chapterSeq: Number(chapterSeq),
      translatedTitle: translatedTitle || null,
      translatedText: translatedText || "",
      sourceDomain: sourceDomain || null,
      translatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        translatedChapters.userId,
        translatedChapters.bookId,
        translatedChapters.chapterSeq,
      ],
      set: {
        translatedTitle: translatedTitle || null,
        translatedText: translatedText || "",
        sourceDomain: sourceDomain || null,
        translatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
