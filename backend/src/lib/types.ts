export type BookSort = "bookmarked" | "last_read" | "recently_updated" | "unread";

const VALID_SORTS: BookSort[] = ["bookmarked", "last_read", "recently_updated", "unread"];

export function getBookSort(params: Record<string, string | string[] | undefined>): BookSort {
  const raw = typeof params.sort === "string" ? params.sort : null;
  return raw && VALID_SORTS.includes(raw as BookSort) ? (raw as BookSort) : "bookmarked";
}

export type ReadingStatus = "reading" | "completed" | "dropped" | "plan_to_read";

const VALID_STATUSES: ReadingStatus[] = ["reading", "completed", "dropped", "plan_to_read"];

export function getReadingStatus(params: Record<string, string | string[] | undefined>): ReadingStatus | null {
  const raw = typeof params.status === "string" ? params.status : null;
  return raw && VALID_STATUSES.includes(raw as ReadingStatus) ? (raw as ReadingStatus) : null;
}

export function isValidReadingStatus(value: unknown): value is ReadingStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as ReadingStatus);
}
