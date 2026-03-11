import { NextResponse } from "next/server";

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

export function apiSuccess(data: unknown, pagination?: Pagination) {
  const body: Record<string, unknown> = { data };
  if (pagination) {
    body.pagination = pagination;
  }
  return NextResponse.json(body);
}

export function apiError(code: string, message: string, status: number = 400) {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}
