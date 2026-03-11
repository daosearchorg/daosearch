"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, CheckCircle2, Clock, CircleOff, Library } from "lucide-react";

const FILTERS = [
  { value: null, label: "All", icon: Library },
  { value: "reading", label: "Reading", icon: BookOpen },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
  { value: "plan_to_read", label: "Plan to Read", icon: Clock },
  { value: "dropped", label: "Dropped", icon: CircleOff },
] as const;

const ACTIVE_STYLES: Record<string, string> = {
  all: "bg-primary text-primary-foreground border-primary",
  reading: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  plan_to_read: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  dropped: "bg-neutral-500/15 text-neutral-500 dark:text-neutral-400 border-neutral-500/30",
};

export function BookStatusFilter({ current }: { current: string | null }) {
  const searchParams = useSearchParams();

  function buildHref(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.delete("page");
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mb-0.5">
      {FILTERS.map((f) => {
        const isActive = current === f.value;
        const Icon = f.icon;
        const key = f.value ?? "all";
        return (
          <Link
            key={key}
            href={buildHref(f.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-all ${
              isActive
                ? ACTIVE_STYLES[key]
                : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
