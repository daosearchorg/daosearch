import type { Metadata } from "next";
export const revalidate = 60;
import { notFound, redirect } from "next/navigation";
import { Pagination } from "@/components/shared/pagination";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { getCommunityBooklistDetail } from "@/lib/queries";
import Link from "next/link";
import { slugify, communityBooklistUrl, timeAgo } from "@/lib/utils";
import { Users, LibraryBig, Clock3, MessageSquareText, Pencil, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/layout/user-avatar";
import { BookCard } from "@/components/book/card";
import { BooklistTags } from "@/components/book/tags";
import { CommunityBooklistFollow } from "@/components/booklist/community-follow";
import { auth } from "@/auth";
import { db } from "@/db";
import { booklistTags } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getBooklistTags } from "@/lib/queries";

interface Props {
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getCommunityBooklistDetail(Number(id));
  if (!data) return { title: "Booklist Not Found" };

  const title = data.booklist.name || "Untitled Booklist";
  const description = data.booklist.description?.slice(0, 256)
    ?? `Browse ${title} — a community booklist on DaoSearch`;
  const ogImage = data.items.find((item) => item.imageUrl)?.imageUrl;

  return {
    title,
    description,
    alternates: { canonical: communityBooklistUrl(Number(id), title) },
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

export default async function CommunityBooklistDetailPage({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const sp = await searchParams;
  const listId = Number(id);
  if (isNaN(listId)) notFound();

  const session = await auth();
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await getCommunityBooklistDetail(listId, page, session?.user?.dbId);
  if (!data) notFound();

  const { booklist, items, total, totalPages } = data;
  const title = booklist.name || "Untitled Booklist";
  const isOwner = session?.user?.dbId === booklist.userId;

  // Fetch community tags
  const [listTags, userTagRows] = await Promise.all([
    getBooklistTags(listId),
    session?.user?.dbId
      ? db
          .select({ tagId: booklistTags.tagId })
          .from(booklistTags)
          .where(and(eq(booklistTags.listId, listId), eq(booklistTags.userId, session.user.dbId)))
      : Promise.resolve([]),
  ]);
  const userTagIds = userTagRows.map((r) => r.tagId);
  const tagsWithVotes = listTags.map((t) => ({
    ...t,
    userVoted: userTagIds.includes(t.id),
  }));

  // Redirect to slug URL if missing or wrong
  const expectedSlug = slugify(title);
  if (expectedSlug && slug?.[0] !== expectedSlug) {
    const qs = page > 1 ? `?page=${page}` : "";
    redirect(`/daosearch/booklists/${listId}/${expectedSlug}${qs}`);
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ScrollToTop />

      {/* Header */}
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-medium tracking-tight leading-tight">{title}</h1>
            {isOwner && (
              <>
                <Badge variant="secondary" className="text-[10px] shrink-0">Your list</Badge>
                <Link
                  href={`/account/lists/${listId}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="size-3" />
                  Edit
                </Link>
              </>
            )}
          </div>

          {/* Owner */}
          <div className="flex items-center gap-2">
            <UserAvatar username={booklist.ownerUsername} avatarUrl={booklist.ownerAvatarUrl} className="size-5" fallbackClassName="text-[9px]" />
            <span className="text-sm text-muted-foreground">{booklist.ownerUsername}</span>
          </div>
        </div>

        {/* Stats bar + follow button */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Users className="size-4 shrink-0" />
            <span className="font-medium tabular-nums">{formatCompact(booklist.followerCount)}</span>
            <span className="hidden sm:inline">followers</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <LibraryBig className="size-4 shrink-0" />
            <span className="font-medium tabular-nums">{booklist.itemCount.toLocaleString()}</span>
            <span className="hidden sm:inline">books</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Clock3 className="size-4 shrink-0" />
            <span className="font-medium">{timeAgo(booklist.updatedAt)}</span>
          </span>
          {/* Follow button — inline with stats */}
          {!isOwner && (
            <CommunityBooklistFollow
              listId={listId}
              initialFollowed={data.userHasFollowed}
              followerCount={booklist.followerCount}
            />
          )}
        </div>

        {/* Description */}
        {booklist.description && (
          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground whitespace-pre-line">{booklist.description}</p>
        )}

        {/* Community Tags */}
        <BooklistTags listId={listId} initialTags={tagsWithVotes} />
      </div>

      {/* Book list */}
      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground text-lg">
          No books in this list yet.
        </p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <div key={item.itemId} className="flex flex-col first:pt-0 pt-2">
                <BookCard
                  variant="list"
                  disablePodium
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
                {item.curatorComment && (
                  <div className="mt-3 mb-4 ml-0 sm:ml-1 border-l-2 border-border pl-3.5 sm:pl-4 pr-3 py-2.5 bg-muted/40 rounded-r-lg">
                    <div className="flex items-center gap-2 mb-1.5">
                      <MessageSquareText className="size-3 text-muted-foreground/50" />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">Curator</span>
                      {(item.curatorReviewLikeCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-400 dark:text-red-400/80">
                          <Heart className="size-3 shrink-0 fill-current" />
                          <span className="tabular-nums text-[11px]">{item.curatorReviewLikeCount}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{item.curatorComment}</p>
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
