import Image from "next/image";
import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import { bookUrl, timeAgo } from "@/lib/utils";

interface FeedComment {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  content: string | null;
  contentTranslated: string | null;
  agreeCount: number | null;
  replyCount: number | null;
  commentCreatedAt: string | Date | null;
  qqUserNickname: string | null;
  qqUserNicknameTranslated: string | null;
  qqUserIconUrl: string | null;
  bookId: number;
  bookTitle: string | null;
  bookTitleOriginal: string | null;
  bookImageUrl: string | null;
}

function FeedItem({ comment }: { comment: FeedComment }) {
  const body = comment.contentTranslated || comment.content || "";

  return (
    <div className="flex gap-3 sm:gap-4 py-4 sm:py-5">
      <Link href={bookUrl(comment.bookId, comment.bookTitle)} className="shrink-0">
        {comment.bookImageUrl ? (
          <Image
            src={comment.bookImageUrl}
            alt={comment.bookTitle || ""}
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
        <div className="flex items-center gap-2">
          <Link
            href={bookUrl(comment.bookId, comment.bookTitle)}
            className="text-sm sm:text-base font-medium line-clamp-1 hover:underline"
          >
            {comment.bookTitle || comment.bookTitleOriginal || "Untitled"}
          </Link>
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          {comment.qqUserIconUrl ? (
            <Image
              src={comment.qqUserIconUrl}
              alt=""
              width={18}
              height={18}
              className="rounded-full size-4 sm:size-[18px] object-cover shrink-0"
            />
          ) : (
            <div className="size-4 sm:size-[18px] rounded-full bg-muted shrink-0" />
          )}
          <span className="text-xs sm:text-sm text-muted-foreground truncate">
            {comment.qqUserNicknameTranslated || comment.qqUserNickname || "Anonymous"}
          </span>
          {comment.commentCreatedAt && (
            <span className="ml-auto text-xs text-muted-foreground/70 shrink-0">
              {timeAgo(comment.commentCreatedAt)}
            </span>
          )}
        </div>

        {comment.titleTranslated && (
          <p className="text-xs sm:text-sm font-medium italic mt-2 tracking-tight line-clamp-1">
            {comment.titleTranslated}
          </p>
        )}

        <p className="text-xs sm:text-sm mt-1.5 line-clamp-3 sm:line-clamp-4 whitespace-pre-line text-muted-foreground">
          {body}
        </p>

        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground/70">
          {(comment.agreeCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-red-400 dark:text-red-400/80">
              <Heart className="size-3.5 fill-current" />
              {comment.agreeCount}
            </span>
          )}
          {(comment.replyCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400/80">
              <MessageCircle className="size-3.5" />
              {comment.replyCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedList({ items }: { items: FeedComment[] }) {
  return (
    <div className="divide-y divide-border/40">
      {items.map((comment) => (
        <FeedItem key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
