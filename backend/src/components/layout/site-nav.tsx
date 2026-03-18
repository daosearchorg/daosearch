"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { Sun, Moon, Menu, Library, Trophy, Rss, ArrowRightLeft, LogIn, LogOut, ListOrdered, ChevronsUpDown, Bell, Bookmark, BookOpen, Heart, List, ListChecks, MessageSquare, Star, Tag, User, SlidersHorizontal, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/layout/user-menu";
import { UserAvatar } from "@/components/layout/user-avatar";
import { NavSearch } from "@/components/layout/nav-search";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LoginDialog } from "@/components/layout/login-dialog";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ReaderSettings } from "@/components/reader/settings";
import { ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription } from "@/components/shared/responsive-dialog";

const NAV_LINKS = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/qidian/rankings", label: "Rankings", icon: Trophy },
  { href: "/qidian/booklists", label: "Booklists", icon: ListOrdered },
  { href: "/daosearch/feed", label: "Feed", icon: Rss },
  { href: "/compare", label: "Compare", icon: ArrowRightLeft },
];

function isLinkActive(pathname: string, href: string, label: string) {
  if (label === "Booklists") return pathname.startsWith("/qidian/booklists") || pathname.startsWith("/daosearch/booklists");
  return pathname.startsWith(href) ||
    (label === "Rankings" && pathname.startsWith("/daosearch/rankings")) ||
    (label === "Feed" && pathname.startsWith("/qidian/feed"));
}

export function SiteNav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);

  const isAuthed = status === "authenticated" && !!session?.user;

  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y < 50 || y < lastScrollY.current);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 bg-background/80 backdrop-blur-md transition-transform duration-300",
        !visible && "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="text-lg sm:text-xl font-semibold tracking-tight">
          DaoSearch
        </Link>

        {/* Desktop: search next to title */}
        <div className="hidden sm:block ml-6">
          <NavSearch />
        </div>

        {/* Desktop nav */}
        <div className="ml-auto hidden sm:flex items-center gap-1">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2 h-9 px-3 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                isLinkActive(pathname, item.href, item.label)
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          ))}

          <Separator orientation="vertical" className="!h-5 mx-2" />
          {isAuthed && <NotificationBell />}
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setReaderSettingsOpen(true)}>
            <Settings2 className="size-[18px]" />
          </Button>
          <UserMenu />
        </div>

        {/* Mobile right side */}
        <div className="ml-auto flex sm:hidden items-center gap-1">
          <NavSearch />
          {isAuthed && <NotificationBell />}
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setReaderSettingsOpen(true)}>
            <Settings2 className="size-[18px]" />
          </Button>

          <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setAccountOpen(false); }}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0 flex flex-col overflow-y-auto">
              <SheetHeader className="px-6 pt-6 pb-2 shrink-0">
                <SheetTitle className="text-lg font-semibold tracking-tight">Menu</SheetTitle>
              </SheetHeader>

              {/* User section — inline at top when authenticated */}
              {isAuthed && (
                <div className="px-3 pt-1 pb-0">
                  <button
                    onClick={() => setAccountOpen(!accountOpen)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <UserAvatar username={session?.user?.publicUsername || session?.user?.name || "User"} avatarUrl={session?.user?.publicAvatarUrl} className="size-6" fallbackClassName="text-[10px]" />
                    <span className="flex-1 truncate text-left">{session?.user?.publicUsername || session?.user?.name || "Account"}</span>
                    <ChevronsUpDown className={cn("size-4 text-muted-foreground transition-transform", accountOpen && "rotate-180")} />
                  </button>
                  {accountOpen && (
                    <div className="flex flex-col pl-3 pb-1">
                      {[
                        { href: "/account", icon: User, label: "Profile" },
                        { href: "/account/bookmarks", icon: Bookmark, label: "Bookmarks" },
                        { href: "/account/lists", icon: List, label: "Lists" },
                        { href: "/account/followed", icon: ListChecks, label: "Followed" },
                        { href: "/account/reading", icon: BookOpen, label: "Reading" },
                        { href: "/account/ratings", icon: Star, label: "Ratings" },
                        { href: "/account/reviews", icon: MessageSquare, label: "Reviews" },
                        { href: "/account/likes", icon: Heart, label: "Likes" },
                        { href: "/account/tags", icon: Tag, label: "Tags" },
                      ].map(({ href, icon: Icon, label }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
                            pathname === href || (href !== "/account" && pathname.startsWith(href))
                              ? "text-foreground font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {label}
                        </Link>
                      ))}
                    </div>
                  )}
                  <Separator className="mt-1" />
                </div>
              )}

              {/* Nav links */}
              <div className="flex flex-col px-3 py-2 flex-1">
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent",
                      isLinkActive(pathname, item.href, item.label)
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <item.icon className="size-5" />
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* Footer — log out / log in */}
              <div className="border-t px-3 py-3 shrink-0">
                {isAuthed ? (
                  <button
                    onClick={() => { signOut(); setOpen(false); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent text-destructive"
                  >
                    <LogOut className="size-5" />
                    Log out
                  </button>
                ) : (
                  <button
                    onClick={() => { setOpen(false); requestAnimationFrame(() => setLoginOpen(true)); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent text-muted-foreground"
                  >
                    <LogIn className="size-5" />
                    Log in
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <ResponsiveDialog open={readerSettingsOpen} onOpenChange={setReaderSettingsOpen} className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Reader Settings</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Customize your reading experience</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="mt-4">
          <ReaderSettings onSaved={() => setReaderSettingsOpen(false)} />
        </div>
      </ResponsiveDialog>
    </nav>
  );
}
