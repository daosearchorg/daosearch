import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBook, getBookChapters } from "@/lib/queries";
import { auth } from "@/auth";
import { db } from "@/db";
import { readingProgresses, translatedChapters, chapters as chaptersTable } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { DaoReaderLanding } from "@/components/dao-reader/landing";
import { DaoReaderExtension } from "@/components/dao-reader/extension";

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

  // Extension mode: ?ext=1&url=...
  if (params.ext === "1" && params.url) {
    return (
      <DaoReaderExtension
        sourceUrl={params.url}
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
  let cachedChapters: { seq: number; title: string | null; translatedAt: Date }[] = [];

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

    cachedChapters = await db
      .select({
        seq: translatedChapters.chapterSeq,
        title: translatedChapters.translatedTitle,
        translatedAt: translatedChapters.translatedAt,
      })
      .from(translatedChapters)
      .where(and(eq(translatedChapters.userId, session.user.dbId), eq(translatedChapters.bookId, bookId)))
      .orderBy(asc(translatedChapters.chapterSeq));
  }

  const isQidian = book.url?.includes("book.qq.com") ?? false;

  let qidianChapters = null;
  if (isQidian) {
    qidianChapters = await getBookChapters(bookId, 1);
  }

  const isExtension = params.ext === "1";
  const extensionUrl = params.url || null;

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
      isAuthenticated={!!session?.user?.dbId}
      isExtension={isExtension}
      extensionUrl={extensionUrl}
    />
  );
}
