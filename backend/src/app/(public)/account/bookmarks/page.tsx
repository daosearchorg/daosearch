import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getUserBookmarks } from "@/lib/queries";
import { bookUrl, timeAgo } from "@/lib/utils";
import { Bookmark, BookOpen, CheckCircle2, Clock, CircleOff } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { AccountNav } from "@/components/layout/account-nav";
import { BookSortSelect } from "@/components/book/sort-select";
import { BookStatusFilter } from "@/components/book/status-filter";
import { getBookSort, getReadingStatus, type BookSort } from "@/lib/types";


interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type BookmarkItem = Awaited<ReturnType<typeof getUserBookmarks>>["items"][number];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof BookOpen; className: string }> = {
  reading: { label: "Reading", icon: BookOpen, className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  plan_to_read: { label: "Plan to Read", icon: Clock, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  dropped: { label: "Dropped", icon: CircleOff, className: "bg-neutral-500/15 text-neutral-500 dark:text-neutral-400" },
};

const STATUS_LABEL: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  plan_to_read: "Plan to Read",
  dropped: "Dropped",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status || !STATUS_CONFIG[status]) return null;
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0 ${config.className}`}>
      <Icon className="size-2.5" />
      {config.label}
    </span>
  );
}

function SortInfo({ item, sort }: { item: BookmarkItem; sort: BookSort }) {
  if (sort === "unread") {
    const total = item.chapterCount ?? 0;
    const read = item.readChapterNumber ?? 0;
    const unread = Math.max(0, total - read);
    return (
      <p className="text-[11px] text-muted-foreground shrink-0">
        {unread} unread
      </p>
    );
  }
  if (sort === "recently_updated") {
    return (
      <p className="text-[11px] text-muted-foreground shrink-0">
        {item.bookUpdateTime ? `updated ${timeAgo(item.bookUpdateTime)}` : "no updates"}
      </p>
    );
  }
  if (sort === "last_read") {
    return (
      <p className="text-[11px] text-muted-foreground shrink-0">
        {item.lastReadAt ? `read ${timeAgo(item.lastReadAt)}` : "not read"}
      </p>
    );
  }
  return (
    <p className="text-[11px] text-muted-foreground shrink-0">
      {timeAgo(item.createdAt)}
    </p>
  );
}

export default async function BookmarksPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const sort = getBookSort(params);
  const status = getReadingStatus(params);
  const { items, total, totalPages } = await getUserBookmarks(session.user.dbId, page, sort, status);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Bookmarks</h1>
          <p className="text-sm text-muted-foreground mt-1">Books you&apos;ve saved for later</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <BookSortSelect current={sort} />
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "book" : "books"}
          </p>
        </div>
        <p className="text-sm text-muted-foreground sm:hidden">
          {total} {total === 1 ? "book" : "books"}
        </p>
      </div>
      <div className="flex justify-center mb-4 sm:hidden">
        <BookSortSelect current={sort} />
      </div>
      <div className="mb-4">
        <BookStatusFilter current={status} />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {status ? `No ${STATUS_LABEL[status]?.toLowerCase() ?? status} books` : "No bookmarks yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {status ? "Try a different filter" : "Bookmark books to save them here"}
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm sm:text-base font-medium truncate">
                        {item.bookTitle || item.bookTitleOriginal || "Untitled"}
                      </p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.bookAuthor || item.bookAuthorOriginal || "Unknown"}
                    </p>
                    {item.genreName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.genreName}</p>
                    )}
                  </div>
                  <SortInfo item={item} sort={sort} />
                </Link>
              ))}
            </div>
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}

    </div>
  );
}
