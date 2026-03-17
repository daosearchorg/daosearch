"use client";

import { useRef, useCallback, type ReactNode } from "react";

interface DragScrollProps {
  children: ReactNode;
  className?: string;
}

export function DragScroll({ children, className }: DragScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const moved = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = "grabbing";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 3) moved.current = true;
    el.scrollLeft = scrollLeft.current - walk;
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    const el = scrollRef.current;
    if (el) el.style.cursor = "grab";
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (moved.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className={className}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
