import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getDatabaseUrl } from "@/lib/env";
import { recordSlowQuery } from "@/lib/slow-log";

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle> | undefined;
};

/**
 * Global slow-query instrumentation. With `prepare:false`,
 * drizzle-orm/postgres-js runs every statement (SSR pages, API routes,
 * src/lib/queries/*) through `client.unsafe(query, params)` — sometimes
 * `.values()`/`.raw()`-chained before being awaited. We wrap `unsafe` to
 * return a transparent Proxy over the postgres-js PendingQuery that times
 * whichever terminal the caller actually consumes, recorded exactly once.
 *
 * Safe because: we never trigger a terminal ourselves, so the lazy
 * PendingQuery still executes exactly once (by Drizzle); `.values()` etc.
 * flip output mode and return the same object, so we re-hand the Proxy and
 * the eventual `.then` is still timed; the `recorded` guard ⇒ one record
 * per logical query. Unknown props fall through (Reflect.get + bind).
 */
type AnyFn = (...args: unknown[]) => unknown;

function instrument(client: ReturnType<typeof postgres>) {
  const realUnsafe = client.unsafe.bind(client);
  // @ts-expect-error same call shape as postgres-js unsafe
  client.unsafe = (query: string, params?: unknown[], options?: unknown) => {
    const pending = realUnsafe(
      query as never,
      params as never,
      options as never,
    );
    const start = performance.now();
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      try {
        recordSlowQuery({ sql: query, ms: performance.now() - start });
      } catch {
        /* never throw into the query path */
      }
    };
    return new Proxy(pending as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target as object, prop, receiver);
        if (prop === "then") {
          return (
            onF?: ((v: unknown) => unknown) | null,
            onR?: ((e: unknown) => unknown) | null,
          ) =>
            (value as AnyFn).call(
              target,
              (v: unknown) => {
                record();
                return onF ? onF(v) : v;
              },
              (e: unknown) => {
                record();
                if (onR) return onR(e);
                throw e;
              },
            );
        }
        if (
          prop === "values" ||
          prop === "raw" ||
          prop === "execute" ||
          prop === "describe"
        ) {
          return (...args: unknown[]) => {
            const next = (value as AnyFn).apply(target, args);
            // postgres-js returns the same object (output-mode flip).
            return next === target ? receiver : next;
          };
        }
        if (typeof value === "function") {
          return (value as AnyFn).bind(target);
        }
        return value;
      },
    });
  };
  return client;
}

if (!globalForDb.db) {
  const client = instrument(
    postgres(getDatabaseUrl(), {
      prepare: false, // Required for PgBouncer transaction-mode pooling
    }),
  );
  globalForDb.db = drizzle(client, { schema });
}

export const db = globalForDb.db;
