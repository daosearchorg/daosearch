import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getUserReadingHistory } from "@/lib/queries";
import { bookUrl, timeAgo } from "@/lib/utils";
import { BookOpen } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { AccountNav } from "@/components/layout/account-nav";


interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReadingPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { items, total, totalPages } = await getUserReadingHistory(session.user.dbId, page);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Reading History</h1>
          <p className="text-sm text-muted-foreground mt-1">Books you&apos;ve been reading</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "book" : "books"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No reading history yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Start reading a book to track your progress
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
                    {item.chapterNumber && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Chapter {item.chapterNumber}
                        {item.chapterTitle && ` — ${item.chapterTitle}`}
                        {!item.chapterTitle && item.chapterTitleOriginal && ` — ${item.chapterTitleOriginal}`}
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground shrink-0">
                    {timeAgo(item.lastReadAt)}
                  </p>
                </Link>
              ))}
            </div>
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}

    </div>
  );
}
