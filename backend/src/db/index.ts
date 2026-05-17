import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getDatabaseUrl } from "@/lib/env";

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle> | undefined;
};

if (!globalForDb.db) {
  const client = postgres(getDatabaseUrl(), {
    prepare: false, // Required for PgBouncer transaction-mode pooling
  });
  globalForDb.db = drizzle(client, { schema });
}

export const db = globalForDb.db;
