import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

if (!globalForRedis.redis) {
  const client = new Redis(env.redis.url, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  // Never let connection errors crash the process or bubble into callers.
  client.on("error", () => {});
  // Start connecting immediately (non-blocking) so the first slow-query
  // records aren't dropped while the lazy connection is still opening.
  // enableOfflineQueue:false still makes commands fail fast when truly down.
  client.connect().catch(() => {});
  globalForRedis.redis = client;
}

export const redis = globalForRedis.redis;
