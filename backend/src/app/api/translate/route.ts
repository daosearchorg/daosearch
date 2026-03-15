import { NextResponse } from "next/server";

const GT_URL = "https://translate.googleapis.com/translate_a/single";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    params.set(k, v);
  }

  try {
    const res = await fetch(`${GT_URL}?${params}`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    params.set(k, v);
  }

  try {
    const res = await fetch(`${GT_URL}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
}
