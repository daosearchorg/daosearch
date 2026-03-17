import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/layout/user-avatar";
import { communityBooklistUrl, timeAgo } from "@/lib/utils";
import { Clock3, LibraryBig, Users } from "lucide-react";
import {
  BooklistCardShell,
  PreviewGrid,
  Stat,
  formatCompactNumber,
} from "@/components/booklist/card-primitives";
import { BooklistsGrid } from "@/components/booklist/booklists-grid";

interface CommunityBooklistPreview {
  listId: number;
  bookId: number;
  title: string | null;
  titleTranslated: string | null;
  imageUrl: string | null;
}

interface CommunityBooklistItem {
  id: number;
  position: number;
  name: string;
  description: string | null;
  followerCount: number;
  itemCount: number;
  updatedAt: Date;
  createdAt: Date;
  ownerUsername: string;
  ownerAvatarUrl: string | null;
  previews: CommunityBooklistPreview[];
  communityTags: { displayName: string; count: number }[];
}

interface CommunityBooklistsListProps {
  items: CommunityBooklistItem[];
  showPodium?: boolean;
}

function CommunityBooklistCard({ item }: { item: CommunityBooklistItem }) {
  return (
    <BooklistCardShell position={item.position}>
      <div className="min-w-0">
        <Link href={communityBooklistUrl(item.id, item.name)} className="hover:underline">
          <h2 className="text-sm sm:text-lg font-medium leading-tight">{item.name}</h2>
        </Link>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <UserAvatar username={item.ownerUsername} avatarUrl={item.ownerAvatarUrl} className="size-4" fallbackClassName="text-[8px]" />
        <span className="text-xs text-muted-foreground">{item.ownerUsername}</span>
      </div>

      {item.description && (
        <p className="mt-2 sm:mt-3 line-clamp-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      )}

      {item.communityTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.communityTags.map((tag) => (
            <Badge key={tag.displayName} variant="secondary" className="font-normal">
              {tag.displayName}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3 sm:pt-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <Stat icon={Users} label="followers" value={formatCompactNumber(item.followerCount)} />
        <Stat icon={LibraryBig} label="books" value={item.itemCount.toLocaleString()} />
        <Stat icon={Clock3} label="" value={timeAgo(item.updatedAt)} />
      </div>

      <PreviewGrid listId={item.id} previews={item.previews} />

      {item.previews.length === 0 && item.itemCount === 0 && (
        <div className="mt-4 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No books yet.
        </div>
      )}
    </BooklistCardShell>
  );
}

export function CommunityBooklistsList({ items, showPodium = true }: CommunityBooklistsListProps) {
  return (
    <BooklistsGrid
      items={items}
      showPodium={showPodium}
      renderCard={(item) => <CommunityBooklistCard item={item} />}
    />
  );
}
