"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Top-level Books | Booklists toggle rendered on /library, /qidian/booklists,
// and /daosearch/booklists. The Booklists link always points at the Qidian
// source (the default); the source dropdown inside BooklistFilters lets users
// flip between Qidian and Community.
const TABS = [
  {
    href: "/library",
    label: "Books",
    match: (p: string) => p === "/library" || p.startsWith("/library/"),
  },
  {
    href: "/qidian/booklists",
    label: "Booklists",
    match: (p: string) =>
      p.startsWith("/qidian/booklists") || p.startsWith("/daosearch/booklists"),
  },
] as const;

export function LibraryTabs() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
