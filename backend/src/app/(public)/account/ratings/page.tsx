import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getUserRatings } from "@/lib/queries";
import { bookUrl, timeAgo } from "@/lib/utils";
import { Star } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { AccountNav } from "@/components/account-nav";

import { Badge } from "@/components/ui/badge";

function RatingBadge({ rating }: { rating: number }) {
  if (rating === 1) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200/60">Good</Badge>
    );
  }
  if (rating === -1) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200/60">Bad</Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200/60">Neutral</Badge>
  );
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RatingsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { items, total, totalPages } = await getUserRatings(session.user.dbId, page);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">My Ratings</h1>
          <p className="text-sm text-muted-foreground mt-1">Books you&apos;ve rated</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "book" : "books"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Star className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No ratings yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rate a book to see it here
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={bookUrl(item.bookId, item.bookTitle ?? item.bookTitleOriginal)}
                  className="flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50"
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
                    <p className="text-xs text-muted-foreground truncate">
                      {item.bookAuthor || item.bookAuthorOriginal || "Unknown"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <RatingBadge rating={item.rating} />
                      <p className="text-[11px] text-muted-foreground">
                        {timeAgo(item.createdAt)}
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
