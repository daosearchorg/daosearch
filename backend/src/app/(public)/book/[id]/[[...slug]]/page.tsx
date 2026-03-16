import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getBook, getBookStats, getBookChapters, getBookComments, getBookReviews, getBookRankings, getBookCommunityRankings, getBookBooklists, getBookCommunityBooklists, getBookRecommendationsWithStats, getBookTags } from "@/lib/queries";
import { GENDER_LABELS, RANK_TYPE_LABELS, RANK_TYPE_CYCLE_LABELS } from "@/lib/constants";
import { auth } from "@/auth";
import { db } from "@/db";
import { chapters as chaptersTable, readingProgresses, bookmarks, bookRatings, bookTags as bookTagsTable } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { slugify, bookUrl } from "@/lib/utils";

import { Trophy, ScrollText, BookOpen, Eye, Bookmark, Star, MessageSquareText, Heart, Users, ThumbsUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookRating } from "@/components/book-rating";
import { BookBookmark } from "@/components/book-bookmark";
import { BookProgress } from "@/components/book-progress";
import { BookReviews } from "@/components/book-reviews";
import { BookChapters } from "@/components/book-chapters";
import { BookBooklists } from "@/components/book-booklists";
import { BookCommunityBooklists } from "@/components/book-community-booklists";
import { BookRecommendations } from "@/components/book-recommendations";
import { BookOpinionsTabs } from "@/components/book-opinions-tabs";
import { BookChaptersFab } from "@/components/book-chapters-fab";
import { BookTags } from "@/components/book-tags";
import { CopyText } from "@/components/copy-text";
import { Synopsis } from "@/components/synopsis";
import { BookFindSources } from "@/components/book-find-sources";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(Number(id));
  if (!book) return { title: "Book Not Found" };

  const title = book.titleTranslated || book.title || "Untitled";
  const author = book.authorTranslated || book.author || "Unknown";
  const synopsis = book.synopsisTranslated?.slice(0, 256) ??
    `Read ${title} — web novel on DaoSearch`;
  const description = `${synopsis}`;
  const genre = book.genreNameTranslated || book.subgenreNameTranslated;

  return {
    title,
    description,
    keywords: [title, book.title, author, book.author, genre, "web novel", "qidian", "chinese novel"].filter(Boolean) as string[],
    alternates: { canonical: bookUrl(Number(id), title) },
    openGraph: {
      title,
      description,
      type: "article",
      siteName: author,
      ...(book.imageUrl ? { images: [{ url: book.imageUrl, width: 200, height: 280, alt: title }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
      ...(book.imageUrl ? { images: [book.imageUrl] } : {}),
    },
  };
}

function timeAgo(date: Date | null) {
  if (!date) return null;
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  }
  return `${months}mo ago`;
}

export default async function BookDetailPage({ params }: Props) {
  const { id, slug } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) notFound();

  // Redirect to slug URL if missing or wrong
  const bookForSlug = await getBook(bookId);
  if (!bookForSlug) notFound();
  const expectedSlug = bookForSlug.titleTranslated ? slugify(bookForSlug.titleTranslated) : null;
  if (expectedSlug && slug?.[0] !== expectedSlug) {
    redirect(`/book/${bookId}/${expectedSlug}`);
  }

  // Pagination is client-side, always start on page 1
  const commentsPage = 1;
  const reviewsPage = 1;

  const session = await auth();

  // Fetch user-specific state server-side (progress, bookmark, rating)
  let progressSeq: number | null = null;
  let isBookmarked = false;
  let userStatus: string | null = null;
  let userRating: number | null = null;
  let userTagIds: number[] = [];
  if (session?.user?.dbId) {
    const [progressRow, bookmarkRow, ratingRow, userTagRows] = await Promise.all([
      db
        .select({ sequenceNumber: chaptersTable.sequenceNumber })
        .from(readingProgresses)
        .leftJoin(chaptersTable, eq(readingProgresses.chapterId, chaptersTable.id))
        .where(and(eq(readingProgresses.userId, session.user.dbId), eq(readingProgresses.bookId, bookId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ id: bookmarks.id, status: bookmarks.status })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, session.user.dbId), eq(bookmarks.bookId, bookId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ rating: bookRatings.rating })
        .from(bookRatings)
        .where(and(eq(bookRatings.userId, session.user.dbId), eq(bookRatings.bookId, bookId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ tagId: bookTagsTable.tagId })
        .from(bookTagsTable)
        .where(and(eq(bookTagsTable.userId, session.user.dbId), eq(bookTagsTable.bookId, bookId))),
    ]);
    progressSeq = progressRow?.sequenceNumber ?? null;
    isBookmarked = bookmarkRow != null;
    userStatus = bookmarkRow?.status ?? null;
    userRating = ratingRow?.rating ?? null;
    userTagIds = userTagRows.map((r) => r.tagId);
  }

  const [book, stats, chapters, comments, reviews, latestChapter, rankings, communityRankings, booklists, communityBooklists, communityTags] = await Promise.all([
    Promise.resolve(bookForSlug),
    getBookStats(bookId),
    getBookChapters(bookId, 1),
    getBookComments(bookId, commentsPage),
    getBookReviews(bookId, reviewsPage, session?.user?.dbId ?? null),
    db
      .select({
        sequenceNumber: chaptersTable.sequenceNumber,
        title: chaptersTable.title,
        titleTranslated: chaptersTable.titleTranslated,
      })
      .from(chaptersTable)
      .where(eq(chaptersTable.bookId, bookId))
      .orderBy(desc(chaptersTable.sequenceNumber))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getBookRankings(bookId),
    getBookCommunityRankings(bookId),
    getBookBooklists(bookId),
    getBookCommunityBooklists(bookId),
    getBookTags(bookId),
  ]);

  if (!book) notFound();

  // Fetch recommendations from qqIds (single combined query)
  const qqIds = book.recommendationQqIds ?? [];
  const recommendations = await getBookRecommendationsWithStats(qqIds);

  const displayTitle = book.titleTranslated || book.title || "Untitled";
  const displayAuthor = book.authorTranslated || book.author || "Unknown";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: displayTitle,
    author: { "@type": "Person", name: displayAuthor },
    ...(book.synopsisTranslated ? { description: book.synopsisTranslated } : {}),
    ...(book.imageUrl ? { image: book.imageUrl } : {}),
    ...(book.genreNameTranslated ? { genre: book.genreNameTranslated } : {}),
    inLanguage: "zh",
    url: `https://daosearch.io${bookUrl(bookId, displayTitle)}`,
  };

  return (
    <div className="flex flex-col gap-8 sm:gap-10 min-w-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
        <div className="shrink-0 self-center sm:self-start flex flex-col items-center gap-3">
          {book.imageUrl && (
            <Image
              src={book.imageUrl}
              alt={displayTitle}
              width={220}
              height={308}
              className="rounded-xl object-cover shadow-md sm:w-[220px] w-[180px]"
              priority
            />
          )}
          {/* Actions — desktop, under cover */}
          <div className="hidden sm:flex flex-col w-[220px] gap-2">
            <BookProgress bookId={bookId} firstChapterId={chapters.items[0]?.id ?? null} initialSeq={progressSeq} bookTitleRaw={book.title || ""} bookUrl={book.url || undefined} />
            <BookBookmark bookId={bookId} bookmarkCount={stats?.bookmarkCount ?? 0} initialBookmarked={isBookmarked} initialStatus={userStatus} />
            <BookFindSources bookId={bookId} bookTitleRaw={book.title || ""} bookUrl={book.url || undefined} currentSeq={progressSeq || undefined} />
          </div>
        </div>
        <div className="flex flex-col min-w-0 flex-1 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
            {displayTitle}
          </h1>
          {book.titleTranslated && book.title && (
            <CopyText text={book.title} className="inline-block mt-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit mx-auto sm:mx-0">
              {book.title}
            </CopyText>
          )}

          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            by{" "}
            <Link href={`/library?author=${encodeURIComponent(displayAuthor)}&exact=1&page=1`} className="font-medium text-foreground hover:underline underline-offset-2">
              {displayAuthor}
            </Link>
          </p>

          {/* Actions — mobile only, right after author */}
          <div className="flex sm:hidden flex-col gap-2 mt-3">
            <BookProgress bookId={bookId} firstChapterId={chapters.items[0]?.id ?? null} initialSeq={progressSeq} bookTitleRaw={book.title || ""} bookUrl={book.url || undefined} />
            <div className="grid grid-cols-2 gap-2">
              <BookBookmark bookId={bookId} bookmarkCount={stats?.bookmarkCount ?? 0} initialBookmarked={isBookmarked} initialStatus={userStatus} />
              <BookFindSources bookId={bookId} bookTitleRaw={book.title || ""} bookUrl={book.url || undefined} currentSeq={progressSeq || undefined} />
            </div>
          </div>

          {/* Tags + Details card */}
          <div className="mt-3 sm:mt-4 rounded-lg sm:rounded-none border sm:border-0 border-border/60 p-3 sm:p-0 flex flex-col gap-3 sm:gap-0">
            {/* Tags */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
              {book.status && (
                <Link href={`/library?status=${book.status}&page=1`}>
                  <Badge variant="outline" className={`text-xs sm:text-sm font-medium capitalize cursor-pointer ${book.status === "ongoing" ? "border-green-500/30 bg-green-500/10 hover:bg-green-500/20" : book.status === "completed" ? "border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20" : "hover:bg-accent"}`}>{book.status}</Badge>
                </Link>
              )}
              {book.genreNameTranslated && book.genreId && (
                <Link href={`/library?genre=${book.genreId}&page=1`}>
                  <Badge variant="outline" className="text-xs sm:text-sm font-medium hover:bg-accent cursor-pointer">{book.genreNameTranslated}</Badge>
                </Link>
              )}
              {book.subgenreNameTranslated && book.subgenreId && (
                <Link href={`/library?subgenre=${book.subgenreId}&page=1`}>
                  <Badge variant="outline" className="text-xs sm:text-sm font-medium hover:bg-accent cursor-pointer">{book.subgenreNameTranslated}</Badge>
                </Link>
              )}
              {book.sexAttr != null && (
                <Link href={`/library?gender=${book.sexAttr === 1 ? "male" : book.sexAttr === 2 ? "female" : "other"}&page=1`}>
                  <Badge variant="outline" className="text-xs sm:text-sm font-medium hover:bg-accent cursor-pointer">{book.sexAttr === 1 ? "Male Lead" : book.sexAttr === 2 ? "Female Lead" : "Other"}</Badge>
                </Link>
              )}
            </div>

            {/* Book details grid */}
            {(() => {
              const hasLength = (book.wordCount ?? 0) > 0 || (stats && stats.chapterCount > 0);
              const hasTimestamps = book.updateTime || book.lastScrapedAt;
              if (!hasLength && !latestChapter && !hasTimestamps) return null;
              return (
                <div className="sm:mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 sm:gap-y-2 text-xs sm:text-sm">
                  {hasLength && (
                    <>
                      <span className="text-muted-foreground font-medium self-center">Length:</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(book.wordCount ?? 0) > 0 && (
                          <Badge variant="secondary" className="text-xs sm:text-sm font-medium gap-1">
                            <span className="tabular-nums">{book.wordCount! >= 1_000_000 ? `${(book.wordCount! / 1_000_000).toFixed(1)}M` : book.wordCount! >= 1_000 ? `${Math.round(book.wordCount! / 1_000)}K` : book.wordCount!}</span>
                            words
                          </Badge>
                        )}
                        {stats && stats.chapterCount > 0 && (
                          <Badge variant="secondary" className="text-xs sm:text-sm font-medium gap-1">
                            <span className="tabular-nums">{stats.chapterCount.toLocaleString()}</span>
                            chapters
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                  {latestChapter && (
                    <>
                      <span className="text-muted-foreground font-medium self-center">Latest:</span>
                      <div className="min-w-0 overflow-hidden text-left">
                        <Badge variant="outline" className="text-xs sm:text-sm font-medium gap-1 max-w-full inline-flex">
                          <span className="truncate">Ch. {latestChapter.sequenceNumber} — {latestChapter.titleTranslated || latestChapter.title || "Untitled"}</span>
                        </Badge>
                      </div>
                    </>
                  )}
                  {hasTimestamps && (
                    <>
                      <span className="text-muted-foreground font-medium self-center">Activity:</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {book.updateTime && (
                          <Badge variant="secondary" className="text-xs sm:text-sm font-medium gap-1">
                            <span className="size-1.5 rounded-full bg-green-500 shrink-0" />
                            Updated {timeAgo(book.updateTime)}
                          </Badge>
                        )}
                        {book.lastScrapedAt && (
                          <Badge variant="secondary" className="text-xs sm:text-sm font-medium gap-1">
                            <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />
                            Scraped {timeAgo(book.lastScrapedAt)}
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
          })()}
          </div>

          {/* Rankings */}
          {(() => {
            const communityBadges = communityRankings.slice(0, 2);
            const qidianBadges = rankings.slice(0, Math.min(2, 4 - communityBadges.length));
            const hasRankings = communityBadges.length > 0 || qidianBadges.length > 0;
            const PERIOD_LABELS: Record<string, string> = { "all-time": "All Time", weekly: "Weekly" };
            if (!hasRankings) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                {communityBadges.map((cr) => (
                  <Link key={cr.period} href={`/daosearch/rankings?period=${cr.period}`}>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-medium cursor-pointer border border-violet-500/20 bg-violet-500/5 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors">
                      <Trophy className="size-2.5 sm:size-3 text-violet-500" />
                      #{cr.position} Community · {PERIOD_LABELS[cr.period] ?? cr.period}
                    </span>
                  </Link>
                ))}
                {qidianBadges.map((r) => {
                  const gender = GENDER_LABELS[r.gender as keyof typeof GENDER_LABELS] ?? r.gender;
                  const rankType = RANK_TYPE_LABELS[r.rankType] ?? r.rankType;
                  const cycle = RANK_TYPE_CYCLE_LABELS[r.rankType]?.[r.cycle] ?? r.cycle;
                  return (
                    <Link key={`${r.gender}-${r.rankType}-${r.cycle}`} href={`/qidian/rankings?gender=${r.gender}&type=${r.rankType}&cycle=${r.cycle}`}>
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-medium cursor-pointer border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors">
                        <Trophy className="size-2.5 sm:size-3 text-amber-500" />
                        #{r.position} {gender} {rankType} · {cycle}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })()}

          {/* Stats */}
          {stats && (() => {
            const allStats: { icon: React.ReactNode; value: string; label: string; valueClassName?: string }[] = [];

            // Community stats
            if (stats.readerCount > 0) allStats.push({ icon: <Eye className="size-3" />, value: formatCompact(stats.readerCount), label: "Readers" });
            if (stats.bookmarkCount > 0) allStats.push({ icon: <Bookmark className="size-3" />, value: formatCompact(stats.bookmarkCount), label: "Bookmarks" });
            if (stats.ratingCount > 0) {
              allStats.push({ icon: <ThumbsUp className="size-3" />, value: formatCompact(stats.ratingCount), label: "Ratings" });
              const good = stats.ratingPositive, total = stats.ratingCount;
              const neutral = stats.ratingNeutral;
              const bad = total - good - neutral;
              const gP = Math.round((good / total) * 100), nP = Math.round((neutral / total) * 100), bP = Math.round((bad / total) * 100);
              const [pct, color] = gP >= nP && gP >= bP ? [gP, "text-green-600 dark:text-green-500"] : nP >= bP ? [nP, "text-amber-500"] : [bP, "text-red-500"];
              allStats.push({ icon: <Star className="size-3" />, value: `${pct}%`, label: "Score", valueClassName: color });
            }
            if (stats.reviewCount > 0) allStats.push({ icon: <MessageSquareText className="size-3" />, value: formatCompact(stats.reviewCount), label: "Reviews" });

            // Official stats
            if (stats.commentCount > 0) allStats.push({ icon: <MessageSquareText className="size-3" />, value: formatCompact(stats.commentCount), label: "Comments" });
            if ((book.qqFavoriteCount ?? 0) > 0) allStats.push({ icon: <Heart className="size-3" />, value: formatCompact(book.qqFavoriteCount!), label: "Favorites" });
            if ((book.qqFanCount ?? 0) > 0) allStats.push({ icon: <Users className="size-3" />, value: formatCompact(book.qqFanCount!), label: "Fans" });
            if (book.qqScore) {
              const qs = parseFloat(String(book.qqScore));
              allStats.push({ icon: <Star className="size-3" />, value: String(book.qqScore), label: "QD Score", valueClassName: qs === 0 ? "" : qs >= 8 ? "text-green-600 dark:text-green-500" : qs >= 5 ? "text-amber-500" : "text-red-500" });
            }

            if (!allStats.length) return null;

            return (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {allStats.map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 px-3 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-muted-foreground">{s.icon}</span>
                      <span className={`text-sm sm:text-base font-semibold tabular-nums leading-none ${s.valueClassName ?? ""}`}>{s.value}</span>
                    </span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}

        </div>
      </div>

      {/* Community tags */}
      <BookTags
        bookId={bookId}
        initialTags={communityTags.map((t) => ({
          ...t,
          userVoted: userTagIds.includes(t.id),
        }))}
      />

      {/* Synopsis */}
      {(book.synopsisTranslated || book.synopsis) && (
        <section>
          <h2 className="text-base sm:text-lg font-medium mb-3">About This Novel</h2>
          <p className="text-sm sm:text-base text-foreground/70 leading-relaxed whitespace-pre-line">{book.synopsisTranslated || book.synopsis!}</p>
        </section>
      )}

      {/* Opinions — mobile: flat section, desktop: tabs with chapters */}
      <section className="sm:hidden flex flex-col gap-6">
        <h2 className="text-base font-medium">What Readers Think</h2>
        {stats && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Rating</p>
            <BookRating
              bookId={bookId}
              ratingPositive={stats.ratingPositive}
              ratingNeutral={stats.ratingNeutral}
              ratingNegative={stats.ratingNegative}
              ratingCount={stats.ratingCount}
              initialUserRating={userRating}
            />
          </div>
        )}
        <BookReviews
          bookId={bookId}
          reviews={reviews}
          comments={comments}
          currentUserId={session?.user?.dbId ?? null}
          lastCommentsScrapedAt={book.lastCommentsScrapedAt ? String(book.lastCommentsScrapedAt) : null}
          userRating={userRating}
        />
      </section>

      <section id="chapters" className="hidden sm:block">
        <BookOpinionsTabs
          reviewCount={reviews.total + comments.total}
          chapterCount={stats?.chapterCount ?? chapters.total}
          opinionsContent={
            <div className="flex flex-col gap-6">
              {stats && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Rating</p>
                  <BookRating
                    bookId={bookId}
                    ratingPositive={stats.ratingPositive}
                    ratingNeutral={stats.ratingNeutral}
                    ratingNegative={stats.ratingNegative}
                    ratingCount={stats.ratingCount}
                    initialUserRating={userRating}
                  />
                </div>
              )}
              <BookReviews
                bookId={bookId}
                reviews={reviews}
                comments={comments}
                currentUserId={session?.user?.dbId ?? null}
                lastCommentsScrapedAt={book.lastCommentsScrapedAt ? String(book.lastCommentsScrapedAt) : null}
                userRating={userRating}
              />
            </div>
          }
          chaptersContent={
            <BookChapters
              bookId={bookId}
              initialItems={[]}
              initialCurrentSeq={progressSeq}
              bookTitleRaw={book.title || ""}
              bookUrl={book.url || undefined}
            />
          }
        />
      </section>

      {/* Booklists */}
      {(booklists.total > 0 || communityBooklists.total > 0) && (
        <section className="flex flex-col gap-6">
          <h2 className="text-base sm:text-lg font-medium">
            Featured in {booklists.total + communityBooklists.total} Booklist{booklists.total + communityBooklists.total !== 1 ? "s" : ""}
          </h2>
          {communityBooklists.total > 0 && (
            <BookCommunityBooklists
              bookId={bookId}
              initialItems={communityBooklists.items}
              total={communityBooklists.total}
            />
          )}
          {booklists.total > 0 && (
            <BookBooklists
              bookId={bookId}
              initialItems={booklists.items}
              total={booklists.total}
            />
          )}
        </section>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <BookRecommendations books={recommendations} />
      )}

      {/* Floating chapter list button */}
      <BookChaptersFab
        bookId={bookId}
        chapterCount={stats?.chapterCount ?? chapters.total}
        progressSeq={progressSeq}
        bookTitleRaw={book.title || ""}
        bookUrl={book.url || undefined}
      />
    </div>
  );
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}


