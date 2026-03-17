"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { Bell, Bookmark, BookOpen, Heart, List, ListChecks, LogIn, LogOut, MessageSquare, Star, Tag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/layout/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GoogleIcon, DiscordIcon } from "@/components/icons/provider-icons";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session?.user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" size="sm" disabled={status === "loading"}>
            <LogIn className="size-4" />
            Log in
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => signIn("google")}>
            <GoogleIcon className="size-4 shrink-0 translate-y-px" />
            Google
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signIn("discord")}>
            <DiscordIcon className="size-4 shrink-0 translate-y-px" />
            Discord
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const { name, publicAvatarUrl, publicUsername } = session.user;
  const displayName = name || publicUsername || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full">
          <UserAvatar username={displayName} avatarUrl={publicAvatarUrl} className="size-7" fallbackClassName="text-xs" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User className="size-4" />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/bookmarks">
            <Bookmark className="size-4" />
            Bookmarks
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/lists">
            <List className="size-4" />
            Lists
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/followed">
            <ListChecks className="size-4" />
            Followed
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/reading">
            <BookOpen className="size-4" />
            Reading
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/ratings">
            <Star className="size-4" />
            Ratings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/reviews">
            <MessageSquare className="size-4" />
            Reviews
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/likes">
            <Heart className="size-4" />
            Likes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/tags">
            <Tag className="size-4" />
            Tags
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => signOut()}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
