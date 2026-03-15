"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Eye, Play, Loader2 } from "lucide-react";
import { LoginDialog } from "@/components/login-dialog";
import { Button } from "@/components/ui/button";

interface BookProgressProps {
  bookId: number;
  firstChapterId?: number | null;
  initialSeq?: number | null;
}

export function BookProgress({ bookId, firstChapterId, initialSeq }: BookProgressProps) {
  const router = useRouter();
  const { status } = useSession();
  const [seq, setSeq] = useState<number | null>(initialSeq ?? null);
  const [saving, setSaving] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const handleStartReading = async () => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    if (!firstChapterId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: firstChapterId }),
      });
      const data = await res.json();
      if (data.sequenceNumber != null) {
        setSeq(data.sequenceNumber);
        window.dispatchEvent(new CustomEvent("progress-updated", { detail: data.sequenceNumber }));
        window.dispatchEvent(new CustomEvent("bookmark-updated", {
          detail: { bookmarked: true, status: "reading" },
        }));
      }
    } catch {}
    setSaving(false);
    router.push(`/book/${bookId}/read?seq=1`);
  };

  const handleReadingClick = () => {
    router.push(`/book/${bookId}/read?seq=${seq}`);
  };

  if (seq != null) {
    return (
      <Button
        variant="default"
        onClick={handleReadingClick}
      >
        <Eye className="size-4" />
        Reading Ch. {seq}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="default"
        onClick={handleStartReading}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Play className="size-4 fill-current" />
        )}
        Start Reading
      </Button>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
