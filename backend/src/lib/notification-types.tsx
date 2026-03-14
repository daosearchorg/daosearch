import { bookUrl, communityBooklistUrl, booklistUrl } from "@/lib/utils";
import type { ReactNode } from "react";

export const NOTIFICATION_TYPES: Record<
  string,
  {
    icon: string;
    label: string;
    description: string;
    getMessage: (meta: Record<string, unknown>, actorName?: string) => ReactNode;
    getUrl: (meta: Record<string, unknown>) => string;
  }
> = {
  review_liked: {
    icon: "Heart",
    label: "Review Likes",
    description: "When someone likes your review",
    getMessage: (m, a) => <><span className="font-medium">{a}</span> liked your review on {m.bookTitle as string}</>,
    getUrl: (m) => bookUrl(m.bookId as number, m.bookTitle as string),
  },
  review_replied: {
    icon: "MessageSquare",
    label: "Review Replies",
    description: "When someone replies to your review",
    getMessage: (m, a) => <><span className="font-medium">{a}</span> replied to your review on {m.bookTitle as string}</>,
    getUrl: (m) => bookUrl(m.bookId as number, m.bookTitle as string),
  },
  mention: {
    icon: "AtSign",
    label: "Mentions",
    description: "When someone @mentions you in a reply",
    getMessage: (m, a) => <><span className="font-medium">{a}</span> mentioned you in a reply on {m.bookTitle as string}</>,
    getUrl: (m) => bookUrl(m.bookId as number, m.bookTitle as string),
  },
  list_followed: {
    icon: "UserPlus",
    label: "List Follows",
    description: "When someone follows your public list",
    getMessage: (m, a) => <><span className="font-medium">{a}</span> followed your list &ldquo;{m.listName as string}&rdquo;</>,
    getUrl: (m) => communityBooklistUrl(m.listId as number, m.listName as string),
  },
  new_chapters: {
    icon: "BookOpen",
    label: "New Chapters",
    description: "When a bookmarked book gets new chapters",
    getMessage: (m) =>
      <>{m.bookTitle as string} has {m.chapterCount as number} new chapter{(m.chapterCount as number) > 1 ? "s" : ""}</>,
    getUrl: (m) => bookUrl(m.bookId as number, m.bookTitle as string),
  },
  list_item_added: {
    icon: "Plus",
    label: "List Updates",
    description: "When a new book is added to a list you follow",
    getMessage: (m) => <>New book added to &ldquo;{m.listName as string}&rdquo;</>,
    getUrl: (m) => communityBooklistUrl(m.listId as number, m.listName as string),
  },
  qidian_booklist_updated: {
    icon: "Plus",
    label: "Official Booklist Updates",
    description: "When an official booklist you follow gets new books",
    getMessage: (m) => <>{m.itemCount as number} new book{(m.itemCount as number) > 1 ? "s" : ""} added to &ldquo;{m.booklistName as string}&rdquo;</>,
    getUrl: (m) => booklistUrl(m.booklistId as number, m.booklistName as string),
  },
};

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES);
