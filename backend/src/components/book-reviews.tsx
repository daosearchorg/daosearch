"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Heart, MessageCircle, Pencil, Trash2, ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/login-dialog";

// ============================================================================
// Types
// ============================================================================

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

interface Reply {
  id: number;
  userId: number;
  replyText: string;
  createdAt: string | Date;
  userDisplayName: string;
  userAvatarUrl: string | null;
}

interface BookReviewsProps {
  bookId: number;
  reviews: {
    items: Review[];
    total: number;
    totalPages: number;
  };
  comments: {
    items: QidianComment[];
    total: number;
    totalPages: number;
  };
  currentUserId: number | null;
  lastCommentsScrapedAt: string | null;
  userRating: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

function timeAgo(date: string | Date | null | undefined) {
  if (!date) return null;
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function RatingBadge({ rating }: { rating: number | null }) {
  if (rating === 1) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-green-50 text-green-600 border-green-200/60">
        Good
      </span>
    );
  }
  if (rating === -1) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-red-50 text-red-600 border-red-200/60">
        Bad
      </span>
    );
  }
  if (rating === 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-amber-50 text-amber-600 border-amber-200/60">
        Neutral
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-zinc-50 text-zinc-400 border-zinc-200/60">
      No rating
    </span>
  );
}

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    // Check after a frame so line-clamp CSS is applied
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    // Re-check after fonts load / layout shifts
    const id = requestAnimationFrame(check);
    return () => cancelAnimationFrame(id);
  }, [text]);

  const toggle = () => setExpanded((e) => !e);

  return (
    <div className="mt-1">
      <p
        ref={textRef}
        onClick={clamped || expanded ? toggle : undefined}
        className={`text-sm sm:text-base whitespace-pre-line break-words ${!expanded ? "line-clamp-4" : ""} ${clamped || expanded ? "cursor-pointer" : ""}`}
      >
        {text}
      </p>
      {(clamped || expanded) && (
        <button
          onClick={toggle}
          className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors block ml-auto sm:mx-auto sm:text-center text-right"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}


// ============================================================================
// @Mention helpers
// ============================================================================

function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@\w+)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-primary font-medium">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

interface MentionUser {
  id: number;
  publicUsername: string;
  publicAvatarUrl: string | null;
}

function useMentionAutocomplete(text: string, cursorPos: number) {
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [active, setActive] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Find @query at cursor position
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\w{2,})$/);

    if (!match) {
      setSuggestions([]);
      setActive(false);
      setMentionLoading(false);
      return;
    }

    const query = match[1];
    setActive(true);
    setMentionLoading(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.users);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setMentionLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, cursorPos]);

  return { suggestions, active, mentionLoading };
}

// ============================================================================
// ReviewReplyThread
// ============================================================================

function ReviewReplyToggle({ replyCount, expanded, onToggle }: { replyCount: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <MessageCircle className="size-3.5" />
      <span>{replyCount}</span>
      {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

function ReviewReplyThread({ reviewId, currentUserId, reviewAuthorUsername }: { reviewId: number; currentUserId: number | null; reviewAuthorUsername?: string }) {
  const { status } = useSession();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState(reviewAuthorUsername ? `@${reviewAuthorUsername} ` : "");
  const [submitting, setSubmitting] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [fetched, setFetched] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { suggestions, active: mentionActive, mentionLoading } = useMentionAutocomplete(replyText, cursorPos);

  const insertMention = (username: string) => {
    const before = replyText.slice(0, cursorPos);
    const after = replyText.slice(cursorPos);
    const atIdx = before.lastIndexOf("@");
    const newText = before.slice(0, atIdx) + `@${username} ` + after;
    setReplyText(newText);
    const newPos = atIdx + username.length + 2;
    setCursorPos(newPos);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
      }
    }, 0);
  };

  const fetchReplies = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/replies`);
      if (res.ok) setReplies(await res.json());
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [reviewId, fetched]);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  const handleSubmitReply = async () => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    const text = replyText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: text }),
      });
      if (res.ok) {
        const newReply = await res.json();
        setReplies((prev) => [...prev, newReply]);
        setReplyText("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditReply = async (replyId: number) => {
    const text = editText.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/replies/${replyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: text }),
      });
      if (res.ok) {
        setReplies((prev) => prev.map((r) => (r.id === replyId ? { ...r, replyText: text } : r)));
        setEditingReplyId(null);
        setEditText("");
      }
    } catch { /* ignore */ }
  };

  const handleDeleteReply = async (replyId: number) => {
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    try {
      await fetch(`/api/replies/${replyId}`, { method: "DELETE" });
    } catch { /* ignore */ }
  };

  return (
    <div className="pl-3 sm:pl-4 border-l border-border/30 space-y-3 mt-2">
      {loading && (
        <div className="flex items-center gap-2 py-1">
          <svg className="size-4 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
      {replies.map((reply) => (
        <div key={reply.id} className="flex items-start gap-2.5 group">
          <UserAvatar username={reply.userDisplayName} avatarUrl={reply.userAvatarUrl} className="size-7 shrink-0 mt-0.5" fallbackClassName="text-[9px]" />
          <div className="min-w-0 flex-1">
            {editingReplyId === reply.id ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{reply.userDisplayName}</span>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleEditReply(reply.id)}
                    disabled={!editText.trim()}
                    size="sm"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => { setEditingReplyId(null); setEditText(""); }}
                    variant="ghost"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{reply.userDisplayName}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(reply.createdAt)}</span>
                  {currentUserId && reply.userId === currentUserId && (
                    <span className="inline-flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        onClick={() => { setEditingReplyId(reply.id); setEditText(reply.replyText); }}
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteReply(reply.id)}
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </span>
                  )}
                </div>
                <p className="text-sm sm:text-base whitespace-pre-line break-words mt-0.5"><MentionText text={reply.replyText} /></p>
              </>
            )}
          </div>
        </div>
      ))}
      <div className="relative">
        <div className="flex items-start gap-2">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => { setReplyText(e.target.value); setCursorPos(e.target.selectionStart); }}
            onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitReply(); } }}
            placeholder="Write a reply..."
            rows={2}
            className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <Button
            onClick={handleSubmitReply}
            disabled={!replyText.trim() || submitting}
            size="sm"
            className="mt-1"
          >
            Reply
          </Button>
        </div>
        {mentionActive && (mentionLoading || suggestions.length > 0) && (
          <div className="absolute left-0 bottom-full mb-1 w-60 rounded-md border bg-popover shadow-md z-10">
            {mentionLoading && suggestions.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Searching users...
              </div>
            ) : (
              suggestions.map((u) => (
                <button
                  key={u.id}
                  onClick={() => insertMention(u.publicUsername)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <UserAvatar username={u.publicUsername} avatarUrl={u.publicAvatarUrl} className="size-6" fallbackClassName="text-[9px]" />
                  <span>{u.publicUsername}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

// ============================================================================
// ReviewCard
// ============================================================================

function ReviewCard({
  review,
  isOwn,
  currentUserId,
  onEdit,
  onDelete,
}: {
  review: Review;
  isOwn: boolean;
  currentUserId: number | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { status } = useSession();
  const [liked, setLiked] = useState(review.userHasLiked);
  const [likeCount, setLikeCount] = useState(Number(review.likeCount) || 0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState(false);

  const handleLike = async () => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => Number(c) + (wasLiked ? -1 : 1));

    try {
      await fetch(`/api/reviews/${review.id}/like`, { method: wasLiked ? "DELETE" : "POST" });
    } catch {
      setLiked(wasLiked);
      setLikeCount((c) => Number(c) + (wasLiked ? 1 : -1));
    }
  };

  return (
    <>
    <div className="flex gap-2.5 sm:gap-3">
      <UserAvatar username={review.userDisplayName} avatarUrl={review.userAvatarUrl} className="size-8 sm:size-9 shrink-0" fallbackClassName="text-xs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-sm font-medium truncate">{review.userDisplayName}</span>
          <span className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <RatingBadge rating={review.rating} />
            <span className="text-xs text-muted-foreground">{timeAgo(review.createdAt)}</span>
          </span>
          {isOwn && (
            <div className="flex items-center gap-1 shrink-0">
              <Button onClick={onEdit} variant="ghost" size="icon-xs" className="text-muted-foreground">
                <Pencil className="size-3" />
              </Button>
              <Button onClick={onDelete} variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-red-500">
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
        </div>
        <ExpandableText text={review.reviewText} />
        <div className="flex gap-3 mt-1.5 sm:mt-2">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs transition-colors ${
              liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className={`size-3.5 ${liked ? "fill-current" : ""}`} />
            <span>{likeCount}</span>
          </button>
          <ReviewReplyToggle
            replyCount={Number(review.replyCount) || 0}
            expanded={repliesExpanded}
            onToggle={() => setRepliesExpanded((e) => !e)}
          />
        </div>
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
    {repliesExpanded && (
      <ReviewReplyThread reviewId={review.id} currentUserId={currentUserId} reviewAuthorUsername={review.userDisplayName} />
    )}
    </>
  );
}

// ============================================================================
// ReviewForm
// ============================================================================

function ReviewForm({
  bookId,
  existingReview,
  userRating,
  onSubmit,
  onCancel,
}: {
  bookId: number;
  existingReview?: { id: number; reviewText: string } | null;
  userRating: number | null;
  onSubmit: (review: Review) => void;
  onCancel?: () => void;
}) {
  const { status, data: session } = useSession();
  const [text, setText] = useState(existingReview?.reviewText ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const handleSubmit = async () => {
    if (status !== "authenticated") {
      setLoginOpen(true);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const isEdit = !!existingReview;
      const url = isEdit
        ? `/api/books/${bookId}/reviews/${existingReview!.id}`
        : `/api/books/${bookId}/reviews`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewText: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        onSubmit({
          id: data.id,
          userId: session?.user?.dbId ?? 0,
          reviewText: data.reviewText,
          createdAt: new Date().toISOString(),
          userDisplayName: session?.user?.publicUsername ?? session?.user?.name ?? "You",
          userAvatarUrl: session?.user?.publicAvatarUrl ?? null,
          rating: userRating,
          likeCount: existingReview ? -1 : 0, // -1 signals "keep existing"
          replyCount: existingReview ? -1 : 0,
          userHasLiked: false,
        });
        if (!isEdit) setText("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a review..."
        rows={3}
        maxLength={5000}
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
      <div className="flex items-center justify-center gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          size="sm"
        >
          {existingReview ? "Save" : "Submit"}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="ghost" size="sm">
            Cancel
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{text.length}/5000</span>
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

// ============================================================================
// BookReviews (Main)
// ============================================================================

// ============================================================================
// BookReviews (Main)
// ============================================================================

export function BookReviews({
  bookId,
  reviews: initialReviews,
  comments: initialComments,
  currentUserId,
  lastCommentsScrapedAt,
  userRating,
}: BookReviewsProps) {
  // Community reviews state
  const [reviewItems, setReviewItems] = useState(initialReviews.items);
  const [reviewTotal, setReviewTotal] = useState(initialReviews.total);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Qidian comments state
  const [commentItems, setCommentItems] = useState(initialComments.items);
  const [commentTotal, setCommentTotal] = useState(initialComments.total);
  const [commentPage, setCommentPage] = useState(1);
  const [commentLoading, setCommentLoading] = useState(false);

  const fetchMoreReviews = useCallback(async () => {
    const nextPage = reviewPage + 1;
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/reviews?page=${nextPage}`);
      const data = await res.json();
      setReviewItems(prev => [...prev, ...data.items]);
      setReviewTotal(data.total);
      setReviewPage(nextPage);
    } catch { /* ignore */ }
    setReviewLoading(false);
  }, [bookId, reviewPage]);

  const fetchMoreComments = useCallback(async () => {
    const nextPage = commentPage + 1;
    setCommentLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/comments?page=${nextPage}`);
      const data = await res.json();
      setCommentItems(prev => [...prev, ...data.items]);
      setCommentTotal(data.total);
      setCommentPage(nextPage);
    } catch { /* ignore */ }
    setCommentLoading(false);
  }, [bookId, commentPage]);

  const userReview = currentUserId ? reviewItems.find((r) => r.userId === currentUserId) : null;
  const otherReviews = reviewItems.filter((r) => r.userId !== currentUserId);

  const handleNewReview = (review: Review) => {
    // Check if this was an edit (signaled by likeCount === -1)
    if (review.likeCount === -1) {
      setReviewItems((prev) =>
        prev.map((r) => (r.id === review.id ? { ...r, reviewText: review.reviewText } : r))
      );
      setEditingId(null);
    } else {
      setReviewItems((prev) => [review, ...prev]);
      setReviewTotal((t) => t + 1);
    }
  };

  const handleDelete = async (reviewId: number) => {
    setReviewItems((prev) => prev.filter((r) => r.id !== reviewId));
    setReviewTotal((t) => Math.max(0, t - 1));
    try {
      await fetch(`/api/books/${bookId}/reviews/${reviewId}`, { method: "DELETE" });
    } catch {
      // Refresh on error
    }
  };

  const showCommunity = true;
  const showQidian = commentItems.length > 0 || initialComments.total > 0;

  if (!showCommunity && !showQidian) return null;

  return (
    <section className="flex flex-col gap-6">
      {/* Community subsection */}
      {showCommunity && (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Community
            <span className="ml-1.5 normal-case tracking-normal">({reviewTotal})</span>
          </p>

          {/* Review form — show if no review yet */}
          {!userReview && editingId === null && (
            showReviewForm ? (
              <ReviewForm bookId={bookId} userRating={userRating} onSubmit={(r) => { handleNewReview(r); setShowReviewForm(false); }} onCancel={() => setShowReviewForm(false)} />
            ) : (
              <div className="flex justify-center">
                <Button size="sm" onClick={() => setShowReviewForm(true)}>
                  <Plus className="size-4" />
                  Write a Review
                </Button>
              </div>
            )
          )}

          <div>
            <div className="divide-y divide-border/40">
              {/* Own review pinned top */}
              {userReview && editingId === userReview.id ? (
                <div className="py-4 sm:py-5">
                  <ReviewForm
                    bookId={bookId}
                    existingReview={userReview}
                    userRating={userRating}
                    onSubmit={handleNewReview}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : userReview ? (
                <div className="py-4 sm:py-5 first:pt-0">
                  <ReviewCard
                    review={userReview}
                    isOwn
                    currentUserId={currentUserId}
                    onEdit={() => setEditingId(userReview.id)}
                    onDelete={() => handleDelete(userReview.id)}
                  />
                </div>
              ) : null}

              {/* Other reviews */}
              {otherReviews.map((review) => (
                <div key={review.id} className="py-4 sm:py-5">
                  <ReviewCard
                    review={review}
                    isOwn={false}
                    currentUserId={currentUserId}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                </div>
              ))}
            </div>
          </div>

          {reviewItems.length < reviewTotal && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={fetchMoreReviews}
                disabled={reviewLoading}
              >
                {reviewLoading && <Loader2 className="size-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Official comments subsection */}
      {showQidian && (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Official
            <span className="ml-1.5 normal-case tracking-normal">({commentTotal})</span>
            {lastCommentsScrapedAt && (
              <span className="ml-1.5 text-[10px] normal-case tracking-normal inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-violet-500" />
                Scraped {timeAgo(lastCommentsScrapedAt)}
              </span>
            )}
          </p>

          <div>
            <div className="divide-y divide-border/40">
              {commentItems.map((comment) => (
                <div key={comment.id} className="flex gap-2.5 sm:gap-3 py-4 sm:py-5">
                  <UserAvatar username={comment.qqUserNicknameTranslated || comment.qqUserNickname || "Anonymous"} avatarUrl={comment.qqUserIconUrl} className="size-8 sm:size-9 shrink-0" fallbackClassName="text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-sm font-medium truncate">
                        {comment.qqUserNicknameTranslated || comment.qqUserNickname || "Anonymous"}
                      </span>
                      <span className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
                        {comment.commentCreatedAt && (
                          <span className="text-xs text-muted-foreground">{timeAgo(comment.commentCreatedAt)}</span>
                        )}
                      </span>
                    </div>
                    {comment.titleTranslated && (
                      <p className="text-sm sm:text-base font-medium italic mt-1.5 tracking-tight">{comment.titleTranslated}</p>
                    )}
                    <ExpandableText text={comment.contentTranslated || comment.content || ""} />
                    {comment.images && (() => {
                      try {
                        const imgs = JSON.parse(comment.images) as Array<string | { url: string }>;
                        if (!imgs.length) return null;
                        return (
                          <div className="flex gap-2 mt-2 overflow-x-auto">
                            {imgs.map((img, i) => {
                              const url = typeof img === "string" ? img : img.url;
                              if (!url) return null;
                              return (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                  <img
                                    src={url}
                                    alt=""
                                    className="rounded-md max-h-48 max-w-[200px] object-cover border"
                                    loading="lazy"
                                  />
                                </a>
                              );
                            })}
                          </div>
                        );
                      } catch { return null; }
                    })()}
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {(comment.agreeCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Heart className="size-3.5" />
                          {comment.agreeCount}
                        </span>
                      )}
                      {(comment.replyCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="size-3.5" />
                          {comment.replyCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {commentItems.length < commentTotal && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={fetchMoreComments}
                disabled={commentLoading}
              >
                {commentLoading && <Loader2 className="size-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
