import Image from "next/image";
import Link from "next/link";
import { bookUrl, communityBooklistUrl, booklistUrl, timeAgo } from "@/lib/utils";
import type { DaoSearchFeedItem } from "@/lib/queries";
import { Bookmark, Glasses, MessageSquareText, MessageCircle, SmilePlus, Frown, Meh, ListChecks } from "lucide-react";
import { UserAvatar } from "@/components/layout/user-avatar";

function ActivityInfo({ type, ratingValue }: { type: string; ratingValue: number | null }) {
  if (type === "rating") {
    if (ratingValue === 1) {
      return (
        <span className="inline-flex items-center gap-1">
          <SmilePlus className="size-4 sm:size-[18px] text-green-500" />
          <span className="text-xs text-muted-foreground">enjoyed this</span>
        </span>
      );
    }
    if (ratingValue === -1) {
      return (
        <span className="inline-flex items-center gap-1">
          <Frown className="size-4 sm:size-[18px] text-red-400" />
          <span className="text-xs text-muted-foreground">didn&apos;t enjoy this</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        <Meh className="size-4 sm:size-[18px] text-amber-500" />
        <span className="text-xs text-muted-foreground">it was okay</span>
      </span>
    );
  }

  if (type === "review") {
    return (
      <span className="inline-flex items-center gap-1">
        <MessageSquareText className="size-4 sm:size-[18px] text-blue-500" />
        <span className="text-xs text-muted-foreground">wrote a review</span>
      </span>
    );
  }

  if (type === "reply") {
    return (
      <span className="inline-flex items-center gap-1">
        <MessageCircle className="size-4 sm:size-[18px] text-indigo-500" />
        <span className="text-xs text-muted-foreground">replied to a review</span>
      </span>
    );
  }

  if (type === "bookmark") {
    return (
      <span className="inline-flex items-center gap-1">
        <Bookmark className="size-4 sm:size-[18px] text-purple-500 fill-current" />
        <span className="text-xs text-muted-foreground">bookmarked</span>
      </span>
    );
  }

  if (type === "list_follow") {
    return (
      <span className="inline-flex items-center gap-1">
        <ListChecks className="size-4 sm:size-[18px] text-teal-500" />
        <span className="text-xs text-muted-foreground">followed a booklist</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Glasses className="size-4 sm:size-[18px] text-muted-foreground" />
      <span className="text-xs text-muted-foreground">is reading</span>
    </span>
  );
}

function getItemHref(item: DaoSearchFeedItem): string {
  if (item.bookId) return bookUrl(item.bookId, item.bookTitle);
  if (item.listId && item.listType === "community") return communityBooklistUrl(item.listId, item.listName);
  if (item.listId && item.listType === "qidian") return booklistUrl(item.listId, item.listName);
  return "#";
}

function FeedItem({ item }: { item: DaoSearchFeedItem }) {
  const href = getItemHref(item);
  const isListActivity = item.activityType === "list_follow";

  return (
    <div className="flex gap-3 sm:gap-4 py-4 sm:py-5">
      <Link href={href} className="shrink-0">
        {isListActivity && !item.bookImageUrl ? (
          <div className="w-12 h-16 sm:w-14 sm:h-[75px] rounded-lg bg-muted flex items-center justify-center">
            <ListChecks className="size-5 text-muted-foreground" />
          </div>
        ) : item.bookImageUrl ? (
          <Image
            src={item.bookImageUrl}
            alt={item.bookTitle || ""}
            width={56}
            height={75}
            className="rounded-lg object-cover w-12 h-16 sm:w-14 sm:h-[75px]"
          />
        ) : (
          <div className="w-12 h-16 sm:w-14 sm:h-[75px] rounded-lg bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
            No img
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="text-sm sm:text-base font-medium line-clamp-1 hover:underline"
        >
          {isListActivity
            ? item.listName || "Untitled list"
            : item.bookTitle || item.bookTitleOriginal || "Untitled"}
        </Link>

        <div className="flex items-center gap-1.5 mt-1.5">
          <UserAvatar username={item.username || "?"} avatarUrl={item.avatarUrl} className="size-5 shrink-0" fallbackClassName="text-[9px]" />
          <span className="text-xs sm:text-sm text-muted-foreground truncate">
            {item.username}
          </span>
          {item.activityAt && (
            <span className="ml-auto text-xs text-muted-foreground/70 shrink-0">
              {timeAgo(item.activityAt)}
            </span>
          )}
        </div>

        <div className="mt-2">
          <ActivityInfo type={item.activityType} ratingValue={item.ratingValue} />
        </div>

        {item.activityType === "review" && item.reviewText && (
          <p className="text-xs sm:text-sm mt-1.5 line-clamp-3 sm:line-clamp-4 whitespace-pre-line text-muted-foreground">
            {item.reviewText}
          </p>
        )}

        {item.activityType === "reply" && item.replyText && (
          <p className="text-xs sm:text-sm mt-1.5 line-clamp-3 sm:line-clamp-4 whitespace-pre-line text-muted-foreground">
            {item.replyText}
          </p>
        )}

        {item.activityType === "read" && item.chapterTitle && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-1">
            Ch. {item.chapterNumber ?? "?"} — {item.chapterTitle}
          </p>
        )}
      </div>
    </div>
  );
}

export function DaoSearchFeedList({ items }: { items: DaoSearchFeedItem[] }) {
  return (
    <div className="divide-y divide-border/40">
      {items.map((item, i) => (
        <FeedItem key={`${item.activityType}-${item.bookId}-${item.listId}-${item.username}-${i}`} item={item} />
      ))}
    </div>
  );
}
