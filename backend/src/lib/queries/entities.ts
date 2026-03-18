import { db } from "@/db";
import { userBookEntities } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getRawQueryRows } from "./feeds";

// ============================================================================
// Entity seeding
// ============================================================================

export async function seedUserEntities(userId: number, bookId: number): Promise<void> {
  // Check if user already has entities for this book
  const existing = await db
    .select({ id: userBookEntities.id })
    .from(userBookEntities)
    .where(and(eq(userBookEntities.userId, userId), eq(userBookEntities.bookId, bookId)))
    .limit(1);

  if (existing.length > 0) return; // Already has entities

  // Get community consensus: most popular translations from other users
  const communityResult = await db.execute(sql`
    SELECT DISTINCT ON (source_term)
      source_term, translated_term, gender, category
    FROM user_book_entities
    WHERE book_id = ${bookId} AND user_id != ${userId}
    GROUP BY source_term, translated_term, gender, category
    ORDER BY source_term, COUNT(*) DESC
  `);

  const communityRows = getRawQueryRows(communityResult);
  if (communityRows.length > 0) {
    // Copy community entities to user's glossary
    await db.insert(userBookEntities).values(
      communityRows.map((e) => ({
        userId,
        bookId,
        sourceTerm: e.source_term as string,
        translatedTerm: e.translated_term as string,
        gender: (e.gender as string) || "N",
        category: (e.category as string) || "character",
      })),
    );
  }
}
