"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Users, LibraryBig, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { UserAvatar } from "@/components/layout/user-avatar";
import { communityBooklistUrl, booklistUrl } from "@/lib/utils";

interface FollowedList {
  id: number;
  name: string;
  description: string | null;
  followerCount: number;
  itemCount: number;
  ownerUsername: string;
  ownerAvatarUrl: string | null;
  followedAt: Date;
  coverImageUrl: string | null;
}

interface FollowedQidianList {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  followerCount: number | null;
  daosearchFollowerCount: number;
  bookCount: number | null;
  followedAt: Date;
  coverImageUrl: string | null;
}

interface FollowedClientProps {
  initialLists: FollowedList[];
  initialQidianLists: FollowedQidianList[];
}

export function FollowedClient({ initialLists, initialQidianLists }: FollowedClientProps) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [qidianLists, setQidianLists] = useState(initialQidianLists);

  const handleUnfollow = async (listId: number) => {
    setLists((prev) => prev.filter((l) => l.id !== listId));
    try {
      await fetch(`/api/lists/${listId}/follow`, { method: "DELETE" });
      router.refresh();
    } catch {
      setLists(initialLists);
    }
  };

  const handleUnfollowQidian = async (booklistId: number) => {
    setQidianLists((prev) => prev.filter((l) => l.id !== booklistId));
    try {
      await fetch(`/api/qidian-booklists/${booklistId}/follow`, { method: "DELETE" });
      router.refresh();
    } catch {
      setQidianLists(initialQidianLists);
    }
  };

  const isEmpty = lists.length === 0 && qidianLists.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-16">
        <ListChecks className="size-8 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No followed booklists</p>
        <p className="text-xs text-muted-foreground mt-1">
          Follow public booklists to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Community booklists */}
      {lists.length > 0 && (
        <div>
          {qidianLists.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Community</p>
          )}
          <div className="flex flex-col gap-2">
              {lists.map((list) => (
                <div key={list.id} className="flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50">
                  {list.coverImageUrl ? (
                    <Link href={communityBooklistUrl(list.id, list.name)} className="shrink-0">
                      <Image
                        src={list.coverImageUrl}
                        alt=""
                        width={56}
                        height={75}
                        className="rounded-lg object-cover w-14 h-[75px]"
                      />
                    </Link>
                  ) : (
                    <div className="w-14 h-[75px] rounded-lg bg-muted shrink-0" />
                  )}
                  <Link href={communityBooklistUrl(list.id, list.name)} className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium truncate">{list.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <UserAvatar username={list.ownerUsername} avatarUrl={list.ownerAvatarUrl} className="size-3.5" fallbackClassName="text-[6px]" />
                      <span className="text-xs text-muted-foreground truncate">{list.ownerUsername}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <LibraryBig className="size-2.5" />
                        {list.itemCount}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="size-2.5" />
                        {list.followerCount}
                      </span>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden sm:inline-flex h-7 text-xs shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnfollow(list.id)}
                  >
                    Unfollow
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnfollow(list.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
        </div>
      )}

      {/* Qidian booklists */}
      {qidianLists.length > 0 && (
        <div>
          {lists.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Official</p>
          )}
          <div className="flex flex-col gap-2">
              {qidianLists.map((list) => {
                const name = list.titleTranslated || list.title || "Untitled";
                return (
                  <div key={list.id} className="flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-accent/50">
                    {list.coverImageUrl ? (
                      <Link href={booklistUrl(list.id, name)} className="shrink-0">
                        <Image
                          src={list.coverImageUrl}
                          alt=""
                          width={40}
                          height={56}
                          className="rounded object-cover"
                        />
                      </Link>
                    ) : (
                      <div className="w-14 h-[75px] rounded-lg bg-muted shrink-0" />
                    )}
                    <Link href={booklistUrl(list.id, name)} className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-medium truncate">{name}</p>
                      {list.titleTranslated && list.title && (
                        <p className="text-xs text-muted-foreground truncate">{list.title}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <LibraryBig className="size-2.5" />
                          {list.bookCount ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users className="size-2.5" />
                          {list.followerCount ?? 0}
                        </span>
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden sm:inline-flex h-7 text-xs shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnfollowQidian(list.id)}
                    >
                      Unfollow
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="sm:hidden size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnfollowQidian(list.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
        </div>
      )}
    </div>
  );
}
