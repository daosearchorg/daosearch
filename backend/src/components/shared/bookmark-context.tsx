"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

interface BookmarkContextValue {
  bookmarkedIds: Set<number>;
  isLoaded: boolean;
}

const BookmarkContext = createContext<BookmarkContextValue>({
  bookmarkedIds: new Set(),
  isLoaded: false,
});

export function BookmarkProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchIds = useCallback(() => {
    fetch("/api/books/bookmarked-ids")
      .then((r) => r.json())
      .then((data) => {
        setBookmarkedIds(new Set(data.ids));
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchIds();
    } else if (status === "unauthenticated") {
      setBookmarkedIds(new Set());
      setIsLoaded(true);
    }
  }, [status, fetchIds]);

  // Listen for bookmark changes from BookBookmark component
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.bookId != null) {
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (detail.bookmarked) {
            next.add(detail.bookId);
          } else {
            next.delete(detail.bookId);
          }
          return next;
        });
      }
    };
    window.addEventListener("bookmark-updated", handler);
    return () => window.removeEventListener("bookmark-updated", handler);
  }, []);

  return (
    <BookmarkContext.Provider value={{ bookmarkedIds, isLoaded }}>
      {children}
    </BookmarkContext.Provider>
  );
}

export function useBookmarkedIds() {
  return useContext(BookmarkContext);
}
