import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBook, getBookChapters, getBookStats } from "@/lib/queries";
import { auth } from "@/auth";
import { db } from "@/db";
import { readingProgresses, translatedChapters, chapters as chaptersTable } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { DaoReaderLanding } from "@/components/reader/landing";
import { DaoReaderExtension } from "@/components/reader/extension";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export const metadata: Metadata = {
  title: "Reader",
  description: "Read and translate Chinese web novels",
};

export default async function ReaderPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await auth();

  // Extension mode: ?ext=1 (with or without url)
  if (params.ext === "1") {
    return (
      <DaoReaderExtension
        sourceUrl={params.url || null}
        isAuthenticated={!!session?.user?.dbId}
      />
    );
  }

  // Book mode: ?book={id}
  const bookId = Number(params.book);
  if (!bookId || isNaN(bookId)) notFound();

  const book = await getBook(bookId);
  if (!book) notFound();

  let savedSourceUrl: string | null = null;
  let savedSeq: number | null = null;
  let savedDomain: string | null = null;
  let cachedChapters: { seq: number; title: string | null; translatedAgo: string }[] = [];

  if (session?.user?.dbId) {
    const [progress] = await db
      .select({
        chapterSeqOverride: readingProgresses.chapterSeqOverride,
        sequenceNumber: chaptersTable.sequenceNumber,
        sourceUrl: readingProgresses.sourceUrl,
        sourceDomain: readingProgresses.sourceDomain,
      })
      .from(readingProgresses)
      .leftJoin(chaptersTable, eq(readingProgresses.chapterId, chaptersTable.id))
      .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)))
      .limit(1);

    if (progress) {
      savedSourceUrl = progress.sourceUrl;
      savedSeq = progress.chapterSeqOverride ?? progress.sequenceNumber ?? null;
      savedDomain = progress.sourceDomain;
    }

    const rawCached = await db
      .select({
        seq: translatedChapters.chapterSeq,
        title: translatedChapters.translatedTitle,
        translatedAt: translatedChapters.translatedAt,
      })
      .from(translatedChapters)
      .where(and(eq(translatedChapters.userId, session.user.dbId), eq(translatedChapters.bookId, bookId)))
      .orderBy(desc(translatedChapters.chapterSeq));

    const now = Date.now();
    cachedChapters = rawCached.map((ch) => {
      const seconds = Math.floor((now - new Date(ch.translatedAt).getTime()) / 1000);
      let ago = "just now";
      if (seconds >= 60) {
        const m = Math.floor(seconds / 60);
        if (m >= 60) {
          const h = Math.floor(m / 60);
          if (h >= 24) {
            const d = Math.floor(h / 24);
            ago = d >= 30 ? (d >= 365 ? `${Math.floor(d / 365)}y ago` : `${Math.floor(d / 30)}mo ago`) : `${d}d ago`;
          } else ago = `${h}h ago`;
        } else ago = `${m}m ago`;
      }
      return { seq: ch.seq, title: ch.title, translatedAgo: ago };
    });
  }

  const isQidian = book.url?.includes("book.qq.com") ?? false;

  const [qidianChapters, stats] = await Promise.all([
    isQidian ? getBookChapters(bookId, 1) : Promise.resolve(null),
    getBookStats(bookId),
  ]);

  return (
    <DaoReaderLanding
      bookId={bookId}
      bookTitle={book.titleTranslated || book.title || "Untitled"}
      bookTitleRaw={book.title || ""}
      bookImageUrl={book.imageUrl}
      savedSourceUrl={savedSourceUrl}
      savedSeq={savedSeq}
      savedDomain={savedDomain}
      cachedChapters={cachedChapters}
      isQidian={isQidian}
      qidianChapters={qidianChapters?.items ?? null}
      qidianTotalPages={qidianChapters?.totalPages ?? 0}
      totalChapterCount={stats?.chapterCount ?? 0}
      isAuthenticated={!!session?.user?.dbId}
    />
  );
}
