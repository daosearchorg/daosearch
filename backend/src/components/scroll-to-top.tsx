"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function ScrollToTop() {
  const searchParams = useSearchParams();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [searchParams]);

  return null;
}
