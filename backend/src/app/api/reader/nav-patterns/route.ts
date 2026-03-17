import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { env } from "@/lib/env";

function getRedis() {
  return new Redis(env.redis.url, { lazyConnect: true, connectTimeout: 5000 });
}

function redisKey(domain: string) {
  return `nav_patterns:${domain}`;
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  const redis = getRedis();
  try {
    await redis.connect();
    const raw = await redis.get(redisKey(domain));
    await redis.quit();

    if (!raw) {
      return NextResponse.json(null);
    }

    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    try { await redis.quit(); } catch {}
    return NextResponse.json({ error: "Failed to fetch patterns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { domain?: string; nextSelector?: string | null; prevSelector?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { domain, nextSelector, prevSelector } = body;
  if (!domain) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }

  if (!nextSelector && !prevSelector) {
    return NextResponse.json({ error: "At least one selector required" }, { status: 400 });
  }

  const redis = getRedis();
  try {
    await redis.connect();

    // Merge with existing patterns
    const existing = await redis.get(redisKey(domain));
    const current = existing ? JSON.parse(existing) : {};

    const pattern = {
      nextSelector: nextSelector || current.nextSelector || null,
      prevSelector: prevSelector || current.prevSelector || null,
      trainedAt: new Date().toISOString(),
      count: (current.count || 0) + 1,
    };

    await redis.set(redisKey(domain), JSON.stringify(pattern));
    await redis.quit();

    return NextResponse.json(pattern);
  } catch (e) {
    try { await redis.quit(); } catch {}
    return NextResponse.json({ error: "Failed to save patterns" }, { status: 500 });
  }
}
