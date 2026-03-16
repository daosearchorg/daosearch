import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { bookUrl, communityBooklistUrl, timeAgo } from "@/lib/utils";
import { Clock3, LibraryBig, Users } from "lucide-react";

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

const POSITION_BADGE: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-white",
  2: "bg-gradient-to-br from-zinc-300 to-zinc-400 text-white",
  3: "bg-gradient-to-br from-amber-500 to-amber-700 text-white",
};

const TOP3_BG: Record<number, string> = {
  1: "bg-gradient-to-r from-amber-500/8 to-transparent",
  2: "bg-gradient-to-r from-zinc-500/8 to-transparent",
  3: "bg-gradient-to-r from-orange-500/8 to-transparent",
};

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground min-w-0">
      <Icon className="size-3 sm:size-3.5 shrink-0" />
      <span className="font-medium tabular-nums whitespace-nowrap">{value}</span>
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
    </div>
  );
}

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function CommunityBooklistCard({ item }: { item: CommunityBooklistItem }) {
  const isTop3 = item.position <= 3;
  const badgeColor = isTop3
    ? POSITION_BADGE[item.position] ?? "bg-foreground/80 text-background"
    : "bg-foreground/80 text-background";
  const cardBg = isTop3 ? TOP3_BG[item.position] ?? "" : "";

  return (
    <Card className={`relative gap-0 p-3.5 sm:p-6 h-full flex flex-col ${cardBg}`}>
      <span className={`absolute -left-2.5 -top-2.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-medium shadow-sm ${badgeColor}`}>
        {item.position}
      </span>
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

      {item.previews.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {item.previews.map((preview) => {
            const previewTitle = preview.titleTranslated || preview.title || "Untitled";
            return (
              <Link key={`${item.id}-${preview.bookId}`} href={bookUrl(preview.bookId, preview.titleTranslated || preview.title)} className="min-w-0">
                <div className="relative overflow-hidden rounded-lg border bg-muted">
                  {preview.imageUrl ? (
                    <Image
                      src={preview.imageUrl}
                      alt={previewTitle}
                      width={80}
                      height={106}
                      className="aspect-[3/4] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] w-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                  {previewTitle}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {item.previews.length === 0 && item.itemCount === 0 && (
        <div className="mt-4 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No books yet.
        </div>
      )}
    </Card>
  );
}

export function CommunityBooklistsList({ items, showPodium = true }: CommunityBooklistsListProps) {
  if (!showPodium) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        {items.map((item) => (
          <CommunityBooklistCard key={item.id} item={item} />
        ))}
      </div>
    );
  }

  const topItems = items.slice(0, 3);
  const restItems = items.slice(3);

  return (
    <>
      {/* Top 3 podium */}
      {topItems.length > 0 && (
        <div className="hidden sm:grid grid-cols-3 gap-5">
          {topItems.map((item) => (
            <CommunityBooklistCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Mobile: all in one column */}
      {topItems.length > 0 && (
        <div className="flex flex-col gap-4 sm:hidden">
          {items.map((item) => (
            <CommunityBooklistCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Desktop: remaining in 2-col grid */}
      {restItems.length > 0 && (
        <div className="hidden sm:grid gap-5 lg:grid-cols-2">
          {restItems.map((item) => (
            <CommunityBooklistCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
