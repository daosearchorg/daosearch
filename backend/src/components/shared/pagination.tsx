import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  paramName?: string;
  searchParams?: Record<string, string>;
}

function buildHref(page: number, paramName: string, searchParams?: Record<string, string>) {
  const params = new URLSearchParams(searchParams);
  params.set(paramName, String(page));
  return `?${params.toString()}`;
}

export function Pagination({ currentPage, totalPages, paramName = "page", searchParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  let start: number;
  if (totalPages <= 3) {
    start = 1;
  } else if (currentPage <= 1) {
    start = 1;
  } else if (currentPage >= totalPages) {
    start = totalPages - 2;
  } else {
    start = currentPage - 1;
  }
  const visiblePages: number[] = [];
  for (let i = start; i < start + 3 && i <= totalPages; i++) visiblePages.push(i);

  return (
    <div className="flex items-center justify-center gap-2 pt-6">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={currentPage <= 1}
        asChild={currentPage > 1}
      >
        {currentPage > 1 ? (
          <Link href={buildHref(1, paramName, searchParams)} scroll>
            <ChevronsLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span><ChevronsLeft className="h-4 w-4" /></span>
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={currentPage <= 1}
        asChild={currentPage > 1}
      >
        {currentPage > 1 ? (
          <Link href={buildHref(currentPage - 1, paramName, searchParams)} scroll>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span><ChevronLeft className="h-4 w-4" /></span>
        )}
      </Button>

      <span className="text-sm tabular-nums text-muted-foreground px-2">
        <span className="font-medium text-foreground">{currentPage}</span>
        {" / "}
        {totalPages}
      </span>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={currentPage >= totalPages}
        asChild={currentPage < totalPages}
      >
        {currentPage < totalPages ? (
          <Link href={buildHref(currentPage + 1, paramName, searchParams)} scroll>
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span><ChevronRight className="h-4 w-4" /></span>
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={currentPage >= totalPages}
        asChild={currentPage < totalPages}
      >
        {currentPage < totalPages ? (
          <Link href={buildHref(totalPages, paramName, searchParams)} scroll>
            <ChevronsRight className="h-4 w-4" />
          </Link>
        ) : (
          <span><ChevronsRight className="h-4 w-4" /></span>
        )}
      </Button>
    </div>
  );
}
