import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { readingProgresses } from "@/db/schema";
import { eq, sql, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

export async function GET(req: NextRequest) {
  const bookId = Number(req.nextUrl.searchParams.get("bookId"));
  if (!bookId || isNaN(bookId)) {
    return NextResponse.json({ error: "bookId required" }, { status: 400 });
  }

  const domains = await getPopularDomains(bookId);
  return NextResponse.json(domains);
}

const getPopularDomains = (bookId: number) =>
  unstable_cache(
    async () => {
      const rows = await db
        .select({
          domain: readingProgresses.sourceDomain,
          readers: sql<number>`count(distinct ${readingProgresses.userId})`,
        })
        .from(readingProgresses)
        .where(
          sql`${readingProgresses.bookId} = ${bookId} AND ${readingProgresses.sourceDomain} IS NOT NULL`,
        )
        .groupBy(readingProgresses.sourceDomain)
        .orderBy(sql`count(distinct ${readingProgresses.userId}) desc`)
        .limit(5);

      // Total unique readers across all domains
      const [totalRow] = await db
        .select({
          total: sql<number>`count(distinct ${readingProgresses.userId})`,
        })
        .from(readingProgresses)
        .where(
          sql`${readingProgresses.bookId} = ${bookId} AND ${readingProgresses.sourceDomain} IS NOT NULL`,
        );

      return {
        domains: rows.filter((r) => r.domain),
        totalReaders: Number(totalRow?.total ?? 0),
      };
    },
    [`popular-domains-${bookId}`],
    { revalidate: 300 },
  )();
