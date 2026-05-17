import { redis } from "@/lib/redis";
import { env } from "@/lib/env";

const RECENT_KEY = "backend:slowlog:recent";
const TOP_KEY = "backend:slowlog:top";
const COUNT_KEY = "backend:slowlog:count";
const RECENT_CAP = 500;
const SQL_MAX = 600;

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, SQL_MAX);

/**
 * Fire-and-forget slow-query recorder. Never awaited in the query path,
 * never throws. Redis being down is harmless (errors swallowed by design).
 */
export function recordSlowQuery(input: { sql: string; ms: number }): void {
  if (!env.slowLog.enabled || input.ms < env.slowLog.thresholdMs) return;
  const sql = normalize(input.sql);
  const ms = Math.round(input.ms);
  const entry = JSON.stringify({ ts: Date.now(), ms, sql });
  void (async () => {
    try {
      const p = redis.pipeline();
      p.lpush(RECENT_KEY, entry);
      p.ltrim(RECENT_KEY, 0, RECENT_CAP - 1);
      p.hincrby(COUNT_KEY, sql, 1);
      await p.exec();
      // ZADD GT needs Redis 6.2+; isolated so an older server only loses
      // the aggregate max, never the recent ring / counts.
      await redis.zadd(TOP_KEY, "GT", ms, sql).catch(() => {});
    } catch {
      /* Redis down / any failure: ignored by design */
    }
  })();
}

export const SLOWLOG_KEYS = {
  recent: RECENT_KEY,
  top: TOP_KEY,
  count: COUNT_KEY,
} as const;
