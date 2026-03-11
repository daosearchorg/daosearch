"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Heart, MessageSquare, AtSign, UserPlus, BookOpen, Plus, Check, Loader2, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/user-avatar";
import { cn, timeAgo } from "@/lib/utils";
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
  createdAt: string | Date;
  actorId: number | null;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
}

interface Pref {
  type: string;
  enabled: boolean;
}

interface NotificationListProps {
  items: NotificationItem[];
  unreadCount: number;
}

export function NotificationList({ items: initialItems, unreadCount: initialUnreadCount }: NotificationListProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // ignore
    }
  };

  const handleClick = async (n: NotificationItem) => {
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
      router.push(config.getUrl(n.metadata));
    }
  };

  const openSettings = async () => {
    const next = !showSettings;
    setShowSettings(next);
    if (next && prefs.length === 0) {
      setPrefsLoading(true);
      try {
        const res = await fetch("/api/notifications/preferences");
        if (res.ok) {
          const data = await res.json();
          setPrefs(data.preferences);
        }
      } finally {
        setPrefsLoading(false);
      }
    }
  };

  const togglePref = async (type: string, enabled: boolean) => {
    setPrefs((prev) => prev.map((p) => (p.type === type ? { ...p, enabled } : p)));
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, enabled }),
      });
    } catch {
      setPrefs((prev) => prev.map((p) => (p.type === type ? { ...p, enabled: !enabled } : p)));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <Check className="size-3.5" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={openSettings}>
            <Settings className="size-3.5" />
            Settings
            {showSettings ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card className="shadow-none p-4 mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Notification preferences</p>
          {prefsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {prefs.map((pref) => {
                const config = NOTIFICATION_TYPES[pref.type];
                if (!config) return null;
                const IconComp = ICON_MAP[config.icon] || Bell;
                return (
                  <div
                    key={pref.type}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <IconComp className="size-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={pref.enabled}
                      onCheckedChange={(checked) => togglePref(pref.type, checked)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="size-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            You&apos;ll be notified when someone interacts with your content
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
            {items.map((n) => {
              const config = NOTIFICATION_TYPES[n.type];
              if (!config) return null;
              const IconComp = ICON_MAP[config.icon] || Bell;
              const message = config.getMessage(n.metadata, n.actorUsername || "Someone");
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex items-start gap-3 w-full text-left px-4 py-3.5 hover:bg-accent transition-colors",
                    !n.read && "bg-accent/40",
                  )}
                >
                  {n.actorUsername ? (
                    <UserAvatar username={n.actorUsername} avatarUrl={n.actorAvatarUrl} className="size-9 shrink-0 mt-0.5" fallbackClassName="text-[10px]" />
                  ) : (
                    <div className="size-9 shrink-0 mt-0.5 rounded-full bg-muted flex items-center justify-center">
                      <IconComp className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="size-2 rounded-full bg-primary shrink-0 mt-2.5" />
                  )}
                </button>
              );
            })}
          </div>
      )}
    </div>
  );
}
