import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getUserTags } from "@/lib/queries";
import { bookUrl, communityBooklistUrl, timeAgo } from "@/lib/utils";
import { Tag, BookOpen, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/pagination";
import { AccountNav } from "@/components/layout/account-nav";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TagsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { items, total, totalPages } = await getUserTags(session.user.dbId, page);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">My Tags</h1>
          <p className="text-sm text-muted-foreground mt-1">Tags you&apos;ve applied to books and lists</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "tag" : "tags"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Tag className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No tags yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tag a book or list to see it here
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              if (item.type === "book") {
                return (
                  <Link
                    key={`book-${item.id}`}
                    href={bookUrl(item.bookId!, item.bookTitle ?? item.bookTitleOriginal)}
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
                      <div className="flex items-center gap-1.5 mt-1">
                        <BookOpen className="size-3 text-muted-foreground/50" />
                        <Badge variant="outline" className="text-xs font-normal border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                          {item.tagName}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {timeAgo(item.createdAt)}
                      </p>
                    </div>
                  </Link>
                );
              }

              return (
                <Link
                  key={`list-${item.id}`}
                  href={communityBooklistUrl(item.listId!, item.listName)}
                  className="flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50"
                >
                  <div className="w-14 h-[75px] rounded-lg bg-muted shrink-0 flex items-center justify-center">
                    <List className="size-5 text-muted-foreground/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium truncate">
                      {item.listName || "Untitled List"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <List className="size-3 text-muted-foreground/50" />
                      <Badge variant="outline" className="text-xs font-normal border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                        {item.tagName}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {timeAgo(item.createdAt)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
