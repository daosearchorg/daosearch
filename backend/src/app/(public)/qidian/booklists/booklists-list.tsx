import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { booklistUrl, timeAgo } from "@/lib/utils";
import { Clock3, LibraryBig, Users } from "lucide-react";
import {
  BooklistCardShell,
  PreviewGrid,
  Stat,
  formatCompactNumber,
} from "@/components/booklist/card-primitives";
import { BooklistsGrid } from "@/components/booklist/booklists-grid";

interface PreviewBook {
  booklistId: number;
  position: number | null;
  bookId: number;
  title: string | null;
  titleTranslated: string | null;
  imageUrl: string | null;
}

interface BooklistItem {
  id: number;
  qidiantuId: number;
  position: number;
  title: string | null;
  titleTranslated: string | null;
  description: string | null;
  descriptionTranslated: string | null;
  tags: string[] | null;
  tagsTranslated: string[] | null;
  followerCount: number | null;
  bookCount: number | null;
  matchedBookCount: number;
  lastUpdatedAt: Date | null;
  updatedAt: Date;
  previews: PreviewBook[];
}

interface BooklistsListProps {
  items: BooklistItem[];
  showPodium?: boolean;
}

function BooklistCard({ item }: { item: BooklistItem }) {
  const title = item.titleTranslated || item.title || "Untitled booklist";
  const description = item.descriptionTranslated || item.description || "No description available yet.";
  const lastUpdated = item.lastUpdatedAt ?? item.updatedAt;

  return (
    <BooklistCardShell position={item.position}>
      <div className="min-w-0">
        <Link href={booklistUrl(item.id, item.titleTranslated || item.title)} className="hover:underline">
          <h2 className="text-sm sm:text-lg font-medium leading-tight">{title}</h2>
        </Link>
      </div>

      <p className="mt-2 sm:mt-3 line-clamp-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">{description}</p>

      {item.tags && item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 6).map((tag, i) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {item.tagsTranslated?.[i] || tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3 sm:pt-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <Stat icon={Users} label="followers" value={formatCompactNumber(item.followerCount ?? 0)} />
        <Stat icon={LibraryBig} label="books" value={(item.bookCount ?? 0).toLocaleString()} />
        <Stat icon={Clock3} label="" value={timeAgo(lastUpdated)} />
      </div>

      <PreviewGrid listId={item.id} previews={item.previews} showPosition />

      {item.previews.length === 0 && item.matchedBookCount === 0 && (
        <div className="mt-4 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No linked books yet.
        </div>
      )}
    </BooklistCardShell>
  );
}

export function BooklistsList({ items, showPodium = true }: BooklistsListProps) {
  return (
    <BooklistsGrid
      items={items}
      showPodium={showPodium}
      renderCard={(item) => <BooklistCard item={item} />}
    />
  );
}
