import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBook, getBookChapters, getBookStats } from "@/lib/queries";
import { auth } from "@/auth";
import { db } from "@/db";
import { readingProgresses, translatedChapters, chapters as chaptersTable } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { slugify } from "@/lib/utils";
import { DaoReaderLanding } from "@/components/reader/landing";

interface Props {
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(Number(id));
  if (!book) return { title: "Reader" };
  const title = book.titleTranslated || book.title || "Untitled";
  return {
    title: `Read ${title}`,
    description: `Translate and read ${title} with DaoSearch Reader`,
  };
}

export default async function ReaderPage({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const sp = await searchParams;
  const bookId = Number(id);
  if (isNaN(bookId)) notFound();

  const book = await getBook(bookId);
  if (!book) notFound();

  // Redirect to slug URL if missing or wrong
  const displayTitle = book.titleTranslated || book.title || "Untitled";
  const expectedSlug = slugify(displayTitle);
  if (expectedSlug && slug?.[0] !== expectedSlug) {
    redirect(`/reader/${bookId}/${expectedSlug}`);
  }

  const session = await auth();

  let savedSourceUrl: string | null = null;
  let savedSeq: number | null = null;
  let savedDomain: string | null = null;
  let otherSources: { sourceDomain: string | null; sourceUrl: string | null; seq: number | null }[] = [];
  let cachedChapters: { seq: number | null; title: string | null; sourceDomain: string | null; sourceUrl: string | null; translatedAgo: string }[] = [];

  if (session?.user?.dbId) {
    const allProgress = await db
      .select({
        chapterSeqOverride: readingProgresses.chapterSeqOverride,
        sequenceNumber: chaptersTable.sequenceNumber,
        sourceUrl: readingProgresses.sourceUrl,
        sourceDomain: readingProgresses.sourceDomain,
        lastReadAt: readingProgresses.lastReadAt,
      })
      .from(readingProgresses)
      .leftJoin(chaptersTable, eq(readingProgresses.chapterId, chaptersTable.id))
      .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)))
      .orderBy(desc(readingProgresses.lastReadAt));

    const primary = allProgress[0];
    if (primary) {
      savedSourceUrl = primary.sourceUrl;
      savedSeq = primary.chapterSeqOverride ?? primary.sequenceNumber ?? null;
      savedDomain = primary.sourceDomain;
    }

    otherSources = allProgress.slice(1).map((p) => ({
      sourceDomain: p.sourceDomain,
      sourceUrl: p.sourceUrl,
      seq: p.chapterSeqOverride ?? p.sequenceNumber ?? null,
    }));

    const rawCached = await db
      .select({
        seq: translatedChapters.chapterSeq,
        title: translatedChapters.translatedTitle,
        sourceDomain: translatedChapters.sourceDomain,
        sourceUrl: translatedChapters.sourceUrl,
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
      return { seq: ch.seq, title: ch.title, sourceDomain: ch.sourceDomain, sourceUrl: ch.sourceUrl, translatedAgo: ago };
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
      bookTitle={displayTitle}
      bookTitleRaw={book.title || ""}
      bookImageUrl={book.imageUrl}
      bookAuthor={book.authorTranslated || book.author || null}
      bookStatus={book.status || null}
      bookWordCount={book.wordCount || null}
      bookUpdateTime={book.updateTime ? String(book.updateTime) : null}
      bookSynopsis={book.synopsisTranslated || book.synopsis || null}
      savedSourceUrl={savedSourceUrl}
      savedSeq={savedSeq}
      savedDomain={savedDomain}
      cachedChapters={cachedChapters}
      isQidian={isQidian}
      qidianChapters={qidianChapters?.items ?? null}
      qidianTotalPages={qidianChapters?.totalPages ?? 0}
      totalChapterCount={stats?.chapterCount ?? 0}
      latestChapter={stats?.latestChapterNumber ?? null}
      isAuthenticated={!!session?.user?.dbId}
      initialSourceUrl={sp.src || null}
      otherSources={otherSources}
    />
  );
}
