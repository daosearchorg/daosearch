import { NextResponse } from "next/server";

const GT_URL = "https://translate.googleapis.com/translate_a/single";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    params.set(k, v);
  }

  const target = `${GT_URL}?${params}`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[translate GET] Google returned ${res.status}: ${text.slice(0, 200)}`);
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json({ error: "Translation failed" }, { status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error(`[translate GET] fetch error:`, e);
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const bodyParams = new URLSearchParams(body);

  const queryParams = new URLSearchParams();
  for (const key of ["client", "sl", "tl", "dt"]) {
    const val = bodyParams.get(key);
    if (val) queryParams.set(key, val);
  }

  const q = bodyParams.get("q") || "";
  const target = `${GT_URL}?${queryParams}`;

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[translate POST] Google returned ${res.status}: ${text.slice(0, 200)}`);
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json({ error: "Translation failed" }, { status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error(`[translate POST] fetch error:`, e);
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
}
