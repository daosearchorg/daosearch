"use client";

import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { BookReviews } from "@/components/book/reviews";
import { BookChapters } from "@/components/book/chapters";
import { Loader2 } from "lucide-react";

interface Chapter {
  id: number;
  sequenceNumber: number;
  title: string | null;
  titleTranslated: string | null;
  url: string | null;
}

interface Review {
  id: number;
  userId: number;
  reviewText: string;
  createdAt: string | Date;
  userDisplayName: string;
  userAvatarUrl: string | null;
  rating: number | null;
  likeCount: number;
  replyCount: number;
  userHasLiked: boolean;
}

interface QidianComment {
  id: number;
  title: string | null;
  titleTranslated: string | null;
  content: string | null;
  contentTranslated: string | null;
  images: string | null;
  agreeCount: number | null;
  replyCount: number | null;
  commentCreatedAt: string | Date | null;
  qqUserNickname: string | null;
  qqUserNicknameTranslated: string | null;
  qqUserIconUrl: string | null;
}

interface BookContentTabsProps {
  bookId: number;
  reviews: { items: Review[]; total: number; totalPages: number };
  comments: { items: QidianComment[]; total: number; totalPages: number };
  currentUserId: number | null;
  lastCommentsScrapedAt: string | null;
  userRating: number | null;
  chapterTotal: number;
  progressSeq: number | null;
  initialTab?: string;
}

export function BookContentTabs({
  bookId,
  reviews,
  comments,
  currentUserId,
  lastCommentsScrapedAt,
  userRating,
  chapterTotal,
  progressSeq,
  initialTab,
}: BookContentTabsProps) {
  const [chaptersData, setChaptersData] = useState<{
    items: Chapter[];
    total: number;
  } | null>(null);
  const validTab = initialTab === "chapters" ? "chapters" : "reviews";
  const [activeTab, setActiveTab] = useState(validTab);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersFetched, setChaptersFetched] = useState(false);

  const fetchChapters = useCallback(async () => {
    if (chaptersFetched) return;
    setChaptersLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/chapters?all=1`);
      const data = await res.json();
      setChaptersData(data);
      setChaptersFetched(true);
    } catch { /* ignore */ }
    setChaptersLoading(false);
  }, [bookId, chaptersFetched]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Update URL query param without navigation
    const url = new URL(window.location.href);
    if (value === "reviews") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", value);
    }
    window.history.replaceState(null, "", url.toString());
    if (value === "chapters" && !chaptersFetched) {
      fetchChapters();
    }
  };

  // Auto-fetch chapters if initial tab is chapters
  useEffect(() => {
    if (validTab === "chapters" && !chaptersFetched) {
      fetchChapters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for custom event from BookProgress to switch to chapters tab
  useEffect(() => {
    const handler = () => {
      handleTabChange("chapters");
    };
    document.addEventListener("switch-tab-chapters", handler);
    return () => document.removeEventListener("switch-tab-chapters", handler);
  }, [chaptersFetched, fetchChapters]);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <div className="grid grid-cols-2 mb-4">
        <button
          onClick={() => handleTabChange("reviews")}
          className={`pb-2.5 text-base sm:text-lg font-medium transition-colors border-b-2 ${
            activeTab === "reviews"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Reviews <span className="text-muted-foreground font-normal">({reviews.total + comments.total})</span>
        </button>
        <button
          onClick={() => handleTabChange("chapters")}
          data-tab-trigger="chapters"
          className={`pb-2.5 text-base sm:text-lg font-medium transition-colors border-b-2 ${
            activeTab === "chapters"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Chapters <span className="text-muted-foreground font-normal">({chapterTotal})</span>
        </button>
      </div>

      <TabsContent value="reviews">
        <BookReviews
          bookId={bookId}
          reviews={reviews}
          comments={comments}
          currentUserId={currentUserId}
          lastCommentsScrapedAt={lastCommentsScrapedAt}
          userRating={userRating}
        />
      </TabsContent>

      <TabsContent value="chapters">
        {chaptersLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {chaptersData && (
          <BookChapters
            bookId={bookId}
            initialItems={chaptersData.items}
            initialCurrentSeq={progressSeq}
          />
        )}
        {!chaptersLoading && !chaptersData && (
          <p className="text-sm text-muted-foreground text-center py-8">Click to load chapters</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
