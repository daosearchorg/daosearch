import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getUserLikedReviews } from "@/lib/queries";
import { bookUrl, timeAgo } from "@/lib/utils";
import { Heart, MessageCircle } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { AccountNav } from "@/components/layout/account-nav";


interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LikesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { items, total, totalPages } = await getUserLikedReviews(session.user.dbId, page);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Likes</h1>
          <p className="text-sm text-muted-foreground mt-1">Reviews you&apos;ve liked</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "like" : "likes"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Heart className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No liked reviews yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Like a review on a book page to see it here
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Link
                  key={item.id}
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
                    <p className="text-[11px] text-muted-foreground truncate">
                      by @{item.reviewAuthorUsername}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {item.reviewText}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {Number(item.reviewLikeCount) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Heart className="size-3" />
                          {item.reviewLikeCount}
                        </span>
                      )}
                      {Number(item.reviewReplyCount) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MessageCircle className="size-3" />
                          {item.reviewReplyCount}
                        </span>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {timeAgo(item.likedAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}

    </div>
  );
}
