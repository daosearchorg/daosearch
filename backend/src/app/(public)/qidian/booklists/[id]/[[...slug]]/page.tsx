import type { Metadata } from "next";
export const revalidate = 60;
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { ScrollToTop } from "@/components/scroll-to-top";
import { getQidianBooklistDetail } from "@/lib/queries";
import { slugify, bookUrl, booklistUrl, timeAgo } from "@/lib/utils";
import { Users, LibraryBig, Clock3, Heart, ScrollText, Star, MessageSquareText } from "lucide-react";
import { BookCard } from "@/components/book-card";
import { QidianBooklistFollow } from "@/components/qidian-booklist-follow";
import { auth } from "@/auth";

interface Props {
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getQidianBooklistDetail(Number(id));
  if (!data) return { title: "Booklist Not Found" };

  const title = data.booklist.titleTranslated || data.booklist.title || "Untitled Booklist";
  const description = data.booklist.descriptionTranslated?.slice(0, 256)
    ?? `Browse ${title} — a curated booklist on DaoSearch`;
  const ogImage = data.items.find((item) => item.imageUrl)?.imageUrl;

  return {
    title,
    description,
    alternates: { canonical: booklistUrl(Number(id), title) },
    openGraph: {
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage, width: 200, height: 280 }] } : {}),
    },
  };
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default async function BooklistDetailPage({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const sp = await searchParams;
  const booklistId = Number(id);
  if (isNaN(booklistId)) notFound();

  const session = await auth();
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await getQidianBooklistDetail(booklistId, page, session?.user?.dbId);
  if (!data) notFound();

  const { booklist, items, total, totalPages } = data;
  const title = booklist.titleTranslated || booklist.title || "Untitled Booklist";
  const description = booklist.descriptionTranslated || booklist.description;
  const lastUpdated = booklist.lastUpdatedAt ?? booklist.updatedAt;

  // Redirect to slug URL if missing or wrong
  const expectedSlug = slugify(title);
  if (expectedSlug && slug?.[0] !== expectedSlug) {
    const qs = page > 1 ? `?page=${page}` : "";
    redirect(`/qidian/booklists/${booklistId}/${expectedSlug}${qs}`);
  }

  const tags = booklist.tagsTranslated ?? booklist.tags;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      {/* Header */}
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">{title}</h1>
          {booklist.titleTranslated && booklist.title && (
            <p className="text-sm text-muted-foreground">{booklist.title}</p>
          )}
        </div>

        {/* Stats bar + follow button */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Users className="size-4 shrink-0" />
            <span className="font-medium tabular-nums">{formatCompact(booklist.followerCount ?? 0)}</span>
            <span className="hidden sm:inline">followers</span>
            {booklist.daosearchFollowerCount > 0 && (
              <span className="text-xs text-muted-foreground/60">({booklist.daosearchFollowerCount} community)</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <LibraryBig className="size-4 shrink-0" />
            <span className="font-medium tabular-nums">{(booklist.bookCount ?? 0).toLocaleString()}</span>
            <span className="hidden sm:inline">books</span>
            <span className="text-xs text-muted-foreground/60">({total} linked)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Clock3 className="size-4 shrink-0" />
            <span className="font-medium">{timeAgo(lastUpdated)}</span>
          </span>
          <QidianBooklistFollow
            booklistId={booklistId}
            initialFollowed={data.userHasFollowed}
          />
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground whitespace-pre-line">{description}</p>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <Badge key={tag} variant="secondary" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Book list */}
      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No linked books found.
        </p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <div key={item.itemId} className="flex flex-col first:pt-0 pt-2">
                <BookCard
                  variant="list"
                  disablePodium
                  position={item.position ?? undefined}
                  title={item.titleTranslated}
                  titleOriginal={item.title}
                  author={item.authorTranslated}
                  authorOriginal={item.author}
                  imageUrl={item.imageUrl}
                  synopsis={item.synopsisTranslated}
                  genreName={item.genreNameTranslated ?? item.genreName}
                  bookId={item.bookId!}
                  stats={{
                    wordCount: item.wordCount,
                    qqScore: item.qqScore,
                    commentCount: item.commentCount,
                    reviewCount: item.reviewCount,
                    ratingCount: item.ratingCount,
                    ratingPositive: item.ratingPositive,
                    ratingNeutral: item.ratingNeutral,
                    ratingNegative: item.ratingNegative,
                  }}
                />
                {/* Curator comment */}
                {(item.curatorCommentTranslated || item.curatorComment) && (
                  <div className="mt-3 mb-4 ml-0 sm:ml-1 border-l-2 border-border pl-3.5 sm:pl-4 pr-3 py-2.5 bg-muted/40 rounded-r-lg">
                    <div className="flex items-center gap-2 mb-1.5">
                      <MessageSquareText className="size-3 text-muted-foreground/50" />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">Curator</span>
                      {(item.heartCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-400 dark:text-red-400/80">
                          <Heart className="size-3 shrink-0 fill-current" />
                          <span className="tabular-nums text-[11px]">{item.heartCount}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{item.curatorCommentTranslated || item.curatorComment}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
