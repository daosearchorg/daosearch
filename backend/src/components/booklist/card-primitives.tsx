import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { bookUrl } from "@/lib/utils";
import { type LucideIcon, Users } from "lucide-react";

export const POSITION_BADGE: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-white",
  2: "bg-gradient-to-br from-zinc-300 to-zinc-400 text-white",
  3: "bg-gradient-to-br from-amber-500 to-amber-700 text-white",
};

export const TOP3_BG: Record<number, string> = {
  1: "bg-gradient-to-r from-amber-500/8 to-transparent",
  2: "bg-gradient-to-r from-zinc-500/8 to-transparent",
  3: "bg-gradient-to-r from-orange-500/8 to-transparent",
};

export function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground min-w-0">
      <Icon className="size-3 sm:size-3.5 shrink-0" />
      <span className="font-medium tabular-nums whitespace-nowrap">{value}</span>
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
    </div>
  );
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface BookPreview {
  bookId: number;
  title: string | null;
  titleTranslated: string | null;
  imageUrl: string | null;
  position?: number | null;
}

export function PreviewGrid({
  listId,
  previews,
  showPosition = false,
}: {
  listId: number;
  previews: BookPreview[];
  showPosition?: boolean;
}) {
  if (previews.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {previews.map((preview) => {
        const previewTitle = preview.titleTranslated || preview.title || "Untitled";
        return (
          <Link key={`${listId}-${preview.bookId}`} href={bookUrl(preview.bookId, preview.titleTranslated || preview.title)} className="min-w-0">
            <div className="relative overflow-hidden rounded-lg border bg-muted">
              {preview.imageUrl ? (
                <Image
                  src={preview.imageUrl}
                  alt={previewTitle}
                  width={80}
                  height={106}
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
              {showPosition && preview.position != null && (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                  #{preview.position}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
              {previewTitle}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

interface BooklistCardShellProps {
  position: number;
  children: React.ReactNode;
}

export function BooklistCardShell({ position, children }: BooklistCardShellProps) {
  const isTop3 = position <= 3;
  const badgeColor = isTop3
    ? POSITION_BADGE[position] ?? "bg-foreground/80 text-background"
    : "bg-foreground/80 text-background";
  const cardBg = isTop3 ? TOP3_BG[position] ?? "" : "";

  return (
    <Card className={`relative gap-0 p-3.5 sm:p-6 h-full flex flex-col ${cardBg}`}>
      <span className={`absolute -left-2.5 -top-2.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-medium shadow-sm ${badgeColor}`}>
        {position}
      </span>
      {children}
    </Card>
  );
}
