"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell, Heart, MessageSquare, AtSign, UserPlus, BookOpen, Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

const ICON_MAP: Record<string, typeof Heart> = {
  Heart,
  MessageSquare,
  AtSign,
  UserPlus,
  BookOpen,
  Plus,
};

interface NotificationItem {
  id: number;
  type: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  actorId: number | null;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function NotificationItems({
  items,
  loading,
  nextCursor,
  onClick,
  onLoadMore,
}: {
  items: NotificationItem[];
  loading: boolean;
  nextCursor: number | null;
  onClick: (n: NotificationItem) => void;
  onLoadMore: () => void;
}) {
  return (
    <div className="max-h-[400px] overflow-y-auto">
      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {items.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">No notifications yet</p>
      )}
      {items.map((n) => {
        const config = NOTIFICATION_TYPES[n.type];
        if (!config) return null;
        const IconComp = ICON_MAP[config.icon] || Bell;
        const message = config.getMessage(n.metadata, n.actorUsername || "Someone");

        return (
          <button
            key={n.id}
            onClick={() => onClick(n)}
            className={cn(
              "flex items-start gap-3 w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border/40 last:border-0",
              !n.read && "bg-accent/40",
            )}
          >
            {n.actorUsername ? (
              <UserAvatar username={n.actorUsername} avatarUrl={n.actorAvatarUrl} className="size-8 shrink-0 mt-0.5" fallbackClassName="text-[10px]" />
            ) : (
              <div className="size-8 shrink-0 mt-0.5 rounded-full bg-muted flex items-center justify-center">
                <IconComp className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
            </div>
            {!n.read && (
              <span className="size-2 rounded-full bg-primary shrink-0 mt-2" />
            )}
          </button>
        );
      })}
      {nextCursor && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="w-full text-center py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin mx-auto" />
          ) : (
            "Load more"
          )}
        </button>
      )}
    </div>
  );
}

const mediaQuery = "(min-width: 640px)";
function subscribeMedia(cb: () => void) {
  const mql = window.matchMedia(mediaQuery);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
function getIsDesktop() {
  return window.matchMedia(mediaQuery).matches;
}

export function NotificationBell() {
  const router = useRouter();
  const isDesktop = useSyncExternalStore(subscribeMedia, getIsDesktop, () => false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const start = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchUnreadCount, 45000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        fetchUnreadCount();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchUnreadCount]);

  const fetchNotifications = useCallback(async (cursor?: number) => {
    setLoading(true);
    try {
      const url = cursor
        ? `/api/notifications?cursor=${cursor}&limit=20`
        : "/api/notifications?limit=20";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setItems((prev) => [...prev, ...data.notifications]);
        } else {
          setItems(data.notifications);
        }
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch { /* ignore */ }
  };

  const handleClick = (n: NotificationItem) => {
    if (!n.read) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
    const config = NOTIFICATION_TYPES[n.type];
    if (config) {
      setOpen(false);
      router.push(config.getUrl(n.metadata));
    }
  };

  const handleViewAll = () => {
    setOpen(false);
    router.push("/account/notifications");
  };

  const bellButton = (
    <Button variant="ghost" size="icon" className="size-9 relative">
      <Bell className="size-[18px]" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-medium px-1">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Button>
  );

  const itemsProps = {
    items,
    loading,
    nextCursor,
    onClick: handleClick,
    onLoadMore: () => nextCursor && fetchNotifications(nextCursor),
  };

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{bellButton}</PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-medium">Notifications</span>
          </div>
          <NotificationItems {...itemsProps} />
          <div className="flex items-center justify-between border-t px-4 py-2">
            <button
              onClick={handleViewAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Check className="size-3" />
                Mark all read
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{bellButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Notifications</DrawerTitle>
        </DrawerHeader>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Notifications</span>
        </div>
        <NotificationItems {...itemsProps} />
        <div className="flex items-center justify-between border-t px-4 py-3">
          <button
            onClick={handleViewAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Check className="size-3" />
              Mark all read
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
