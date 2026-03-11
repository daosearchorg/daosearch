"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bookmark, BookOpen, Heart, List, ListChecks, MessageSquare, Star, Tag, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCOUNT_LINKS = [
  { href: "/account", icon: User, label: "Profile" },
  { href: "/account/notifications", icon: Bell, label: "Notifications" },
  { href: "/account/bookmarks", icon: Bookmark, label: "Bookmarks" },
  { href: "/account/lists", icon: List, label: "Lists" },
  { href: "/account/followed", icon: ListChecks, label: "Followed" },
  { href: "/account/reading", icon: BookOpen, label: "Reading" },
  { href: "/account/ratings", icon: Star, label: "Ratings" },
  { href: "/account/reviews", icon: MessageSquare, label: "Reviews" },
  { href: "/account/likes", icon: Heart, label: "Likes" },
  { href: "/account/tags", icon: Tag, label: "Tags" },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <div className="mb-4 -mx-4 sm:mx-0">
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 px-4 sm:px-0 min-w-max sm:min-w-0 sm:flex-wrap sm:justify-center">
          {ACCOUNT_LINKS.map(({ href, icon: Icon, label }) => {
            const isActive = href === "/account"
              ? pathname === "/account"
              : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground shrink-0",
                  isActive && "bg-accent text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
