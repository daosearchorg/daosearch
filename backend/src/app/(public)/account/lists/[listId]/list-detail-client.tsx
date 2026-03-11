"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookUrl, timeAgo } from "@/lib/utils";
import type { BookSort } from "@/lib/types";


interface ListBook {
  id: number;
  bookId: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
  addedAt: Date;
  lastReadAt: Date | null;
  bookUpdateTime: Date | null;
  chapterCount: number | null;
  readChapterNumber: number | null;
}

interface ListDetailClientProps {
  listId: number;
  initialItems: ListBook[];
  sort: BookSort;
}

function SortInfo({ item, sort }: { item: ListBook; sort: BookSort }) {
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
      {timeAgo(item.addedAt)}
    </p>
  );
}

export function ListDetailClient({ listId, initialItems, sort }: ListDetailClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);

  const handleRemove = async (bookId: number) => {
    setItems((prev) => prev.filter((i) => i.bookId !== bookId));

    try {
      await fetch(`/api/lists/${listId}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      router.refresh();
    } catch {
      setItems(initialItems);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">This list is empty</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add books from any book page using the bookmark button
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50">
            {item.imageUrl ? (
              <Link href={bookUrl(item.bookId, item.titleTranslated ?? item.title)} className="shrink-0">
                <Image
                  src={item.imageUrl}
                  alt=""
                  width={56}
                  height={75}
                  className="rounded-lg object-cover w-14 h-[75px]"
                />
              </Link>
            ) : (
              <div className="w-14 h-[75px] rounded-lg bg-muted shrink-0" />
            )}
            <Link href={bookUrl(item.bookId, item.titleTranslated ?? item.title)} className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-medium truncate">
                {item.titleTranslated || item.title || "Untitled"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {item.authorTranslated || item.author || "Unknown"}
              </p>
              <SortInfo item={item} sort={sort} />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(item.bookId)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
  );
}
