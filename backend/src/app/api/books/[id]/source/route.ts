import { auth } from "@/auth";
import { db } from "@/db";
import { readingProgresses, bookSources } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ domain: null, novelUrl: null });
  }

  // Get user's last-used source domain for this book
  const [progress] = await db
    .select({ sourceDomain: readingProgresses.sourceDomain })
    .from(readingProgresses)
    .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)))
    .limit(1);

  if (!progress?.sourceDomain) {
    return NextResponse.json({ domain: null, novelUrl: null });
  }

  // Look up the source URL
  const [source] = await db
    .select({ domain: bookSources.domain, novelUrl: bookSources.novelUrl })
    .from(bookSources)
    .where(and(eq(bookSources.bookId, bookId), eq(bookSources.domain, progress.sourceDomain)))
    .limit(1);

  return NextResponse.json({
    domain: source?.domain ?? null,
    novelUrl: source?.novelUrl ?? null,
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { domain, novelUrl } = body;
  if (!domain || !novelUrl) {
    return NextResponse.json({ error: "Missing domain or novelUrl" }, { status: 400 });
  }

  // Upsert book source
  await db
    .insert(bookSources)
    .values({ bookId, domain, novelUrl, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [bookSources.bookId, bookSources.domain],
      set: { novelUrl, lastCheckedAt: new Date() },
    });

  // Update reading progress source domain
  await db
    .update(readingProgresses)
    .set({ sourceDomain: domain, updatedAt: new Date() })
    .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)));

  return NextResponse.json({ domain, novelUrl });
}
