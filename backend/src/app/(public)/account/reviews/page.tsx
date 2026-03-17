import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getUserReviews, getUserReplies } from "@/lib/queries";
import { bookUrl, timeAgo } from "@/lib/utils";
import { MessageSquare, Heart, MessageCircle } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { AccountNav } from "@/components/layout/account-nav";


interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReviewsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [reviews, replies] = await Promise.all([
    getUserReviews(session.user.dbId, page),
    getUserReplies(session.user.dbId, page),
  ]);

  // Merge and sort by date descending
  const merged = [
    ...reviews.items.map((r) => ({ ...r, kind: "review" as const })),
    ...replies.items.map((r) => ({ ...r, kind: "reply" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalCount = reviews.total + replies.total;

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">My Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">Reviews and replies you&apos;ve written</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? "item" : "items"}
        </p>
      </div>

      {merged.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No reviews or replies yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Write a review on a book page to see it here
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
              {merged.map((item) => (
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={bookUrl(item.bookId, item.bookTitle ?? item.bookTitleOriginal)}
                  className="flex gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50"
                >
                  {item.bookImageUrl ? (
                    <Image
                      src={item.bookImageUrl}
                      alt=""
                      width={56}
                      height={75}
                      className="rounded-lg object-cover shrink-0 w-14 h-[75px]"
                    />
                  ) : (
                    <div className="w-14 h-[75px] rounded-lg bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium truncate">
                      {item.bookTitle || item.bookTitleOriginal || "Untitled"}
                    </p>
                    {item.kind === "reply" && "reviewAuthorUsername" in item && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        replying to @{item.reviewAuthorUsername}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {item.kind === "review" && "reviewText" in item ? item.reviewText : ""}
                      {item.kind === "reply" && "replyText" in item ? item.replyText : ""}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.kind === "review" && "likeCount" in item && Number(item.likeCount) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Heart className="size-3" />
                          {item.likeCount}
                        </span>
                      )}
                      {item.kind === "review" && "replyCount" in item && Number(item.replyCount) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MessageCircle className="size-3" />
                          {item.replyCount}
                        </span>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {timeAgo(item.createdAt)}
                      </p>
                      {item.kind === "reply" && (
                        <span className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] border bg-blue-50 text-blue-600 border-blue-200/60">
                          Reply
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          <Pagination currentPage={page} totalPages={Math.max(reviews.totalPages, replies.totalPages)} />
        </>
      )}

    </div>
  );
}
