"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Pencil } from "lucide-react";
import { GoogleIcon, DiscordIcon } from "@/components/icons/provider-icons";
import { AccountNav } from "@/components/layout/account-nav";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/layout/user-avatar";

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "google":
      return <GoogleIcon className="size-4" />;
    case "discord":
      return <DiscordIcon className="size-4" />;
    default:
      return null;
  }
}

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [draftUsername, setDraftUsername] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);


  if (status === "loading" || !session?.user) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { name, email, publicUsername, provider } = session.user;
  const username = draftUsername ?? publicUsername;
  const avatarUrl = avatarOverride ?? session.user.publicAvatarUrl;
  const displayName = name || publicUsername || "User";

  async function handleSave() {
    setUsernameError("");
    const trimmed = username.trim();

    if (trimmed !== publicUsername) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmed)) {
        setUsernameError("3-30 characters, letters, numbers, underscores only");
        return;
      }

      setSaving(true);
      const res = await fetch("/api/account/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        setUsernameError(data.error || "Failed to update");
        setSaving(false);
        return;
      }

      await update({ publicUsername: trimmed });
      setDraftUsername(null);
      setSaving(false);
    }

    setDraftUsername(null);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
    setDraftUsername(null);
    setUsernameError("");
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert("Image must be under 1 MB");
      return;
    }

    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("avatar", file);

    const res = await fetch("/api/account/avatar", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      setAvatarOverride(data.url);
      await update({ publicAvatarUrl: data.url });
    } else {
      const data = await res.json();
      alert(data.error || "Upload failed");
    }

    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <div className="text-center mb-6">
        <h1 className="text-2xl font-normal tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile and settings
        </p>
      </div>

      {/* Profile card */}
      <Card className="shadow-none gap-0 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="relative">
              <UserAvatar username={publicUsername} avatarUrl={avatarUrl} className="size-20" fallbackClassName="text-2xl" />
              {editing && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="size-5 animate-spin text-white" />
                  ) : (
                    <Camera className="size-5 text-white" />
                  )}
                </button>
              )}
            </div>
            {editing && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Change photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          {/* Fields + Edit button */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-medium">{displayName}</p>
                <p className="text-sm text-muted-foreground">@{publicUsername}</p>
              </div>
              {!editing && (
                <Button size="sm" variant="outline" onClick={() => { setDraftUsername(publicUsername); setEditing(true); }}>
                  <Pencil className="size-3" />
                  Edit
                </Button>
              )}
            </div>

            {editing && (
              <div className="mt-3 space-y-1">
                <Label className="text-xs text-muted-foreground">Username</Label>
                <Input
                  value={username}
                  onChange={(e) => {
                    setDraftUsername(e.target.value);
                    setUsernameError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="h-8 text-sm"
                  autoFocus
                />
                {usernameError && (
                  <p className="text-xs text-destructive">{usernameError}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="size-3 animate-spin" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <p className="text-sm">{email}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Provider</Label>
                <p className="text-sm capitalize flex items-center gap-1.5">
                  <ProviderIcon provider={provider} />
                  {provider}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Your username and avatar are publicly visible. Your display name, email, and provider are not visible anywhere on the site.
        </p>
      </Card>

    </div>
  );
}
