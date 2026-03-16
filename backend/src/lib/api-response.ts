import { NextResponse } from "next/server";

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

export function apiSuccess(data: unknown, pagination?: Pagination, cacheSeconds?: number) {
  const body: Record<string, unknown> = { data };
  if (pagination) {
    body.pagination = pagination;
  }
  const headers: Record<string, string> = {};
  if (cacheSeconds) {
    headers["Cache-Control"] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}`;
  }
  return NextResponse.json(body, { headers });
}

export function apiError(code: string, message: string, status: number = 400) {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}
