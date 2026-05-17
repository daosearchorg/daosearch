import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { apiError } from "@/lib/api-response";
import { SLOWLOG_KEYS } from "@/lib/slow-log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get("token") ||
    req.headers.get("x-slowlog-token") ||
    "";

  // No token configured → endpoint disabled (hidden as 404).
  if (!env.slowLog.token) {
    return apiError("NOT_FOUND", "Not found", 404);
  }
  if (token !== env.slowLog.token) {
    return apiError("UNAUTHORIZED", "Invalid token", 401);
  }

  try {
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") || "100", 10) || 100,
      500,
    );
    const [recentRaw, topRaw, counts] = await Promise.all([
      redis.lrange(SLOWLOG_KEYS.recent, 0, limit - 1),
      redis.zrevrange(SLOWLOG_KEYS.top, 0, 49, "WITHSCORES"),
      redis.hgetall(SLOWLOG_KEYS.count),
    ]);

    const recent = recentRaw.map((r) => {
      try {
        return JSON.parse(r) as unknown;
      } catch {
        return { raw: r };
      }
    });

    const top: Array<{ sql: string; maxMs: number; count: number }> = [];
    for (let i = 0; i < topRaw.length; i += 2) {
      const sql = topRaw[i];
      top.push({
        sql,
        maxMs: Number(topRaw[i + 1]),
        count: Number(counts[sql] || 0),
      });
    }

    return NextResponse.json({ recent, top });
  } catch {
    return apiError("REDIS_UNAVAILABLE", "Slow-log store unavailable", 503);
  }
}
