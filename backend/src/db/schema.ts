import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================================
// Core Tables
// ============================================================================

export const genres = pgTable("genres", {
  id: serial().primaryKey(),
  name: varchar({ length: 255 }).notNull().unique(),
  nameTranslated: varchar("name_translated", { length: 255 }),
  blacklisted: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_genres_name").on(table.name),
]);

export const books = pgTable("books", {
  id: serial().primaryKey(),
  url: varchar({ length: 500 }).notNull().unique(),
  imageUrl: varchar("image_url", { length: 500 }),
  title: varchar({ length: 500 }),
  titleTranslated: varchar("title_translated", { length: 500 }),
  author: varchar({ length: 255 }),
  authorTranslated: varchar("author_translated", { length: 255 }),
  updateTime: timestamp("update_time", { withTimezone: true }),
  synopsis: text(),
  synopsisTranslated: text("synopsis_translated"),
  genreId: integer("genre_id").references(() => genres.id, { onDelete: "set null" }),
  subgenreId: integer("subgenre_id").references(() => genres.id, { onDelete: "set null" }),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  lastCommentsScrapedAt: timestamp("last_comments_scraped_at", { withTimezone: true }),
  qidianId: integer("qidian_id"),
  qidiantuUrl: varchar("qidiantu_url", { length: 512 }),
  wordCount: integer("word_count"),
  status: varchar({ length: 20 }),
  sexAttr: integer("sex_attr"),
  qqScore: varchar("qq_score", { length: 10 }),
  qqScoreCount: integer("qq_score_count"),
  qqFavoriteCount: integer("qq_favorite_count"),
  qqFanCount: integer("qq_fan_count"),
  recommendationQqIds: integer("recommendation_qq_ids").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_books_url").on(table.url),
  index("idx_books_genre_id").on(table.genreId),
  index("idx_books_subgenre_id").on(table.subgenreId),
  index("idx_books_updated_at").on(table.updatedAt),
  index("idx_books_update_time").on(table.updateTime),
  index("idx_books_title_trgm").using("gin", sql`"title" gin_trgm_ops`),
  index("idx_books_title_translated_trgm").using("gin", sql`"title_translated" gin_trgm_ops`),
  index("idx_books_author_trgm").using("gin", sql`"author" gin_trgm_ops`),
  index("idx_books_author_translated_trgm").using("gin", sql`"author_translated" gin_trgm_ops`),
]);

export const chapters = pgTable("chapters", {
  id: serial().primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  sequenceNumber: integer("sequence_number").notNull(),
  title: varchar({ length: 500 }),
  titleTranslated: varchar("title_translated", { length: 500 }),
  url: varchar({ length: 500 }),
  locked: boolean("locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_chapter_book_sequence").on(table.bookId, table.sequenceNumber),
  index("idx_chapters_book_id").on(table.bookId),
  index("idx_chapters_book_sequence").on(table.bookId, table.sequenceNumber),
  index("idx_chapters_url").on(table.url),
]);

// ============================================================================
// User Tables
// ============================================================================

export const users = pgTable("users", {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  publicUsername: varchar("public_username", { length: 255 }).notNull().unique(),
  publicAvatarUrl: varchar("public_avatar_url", { length: 255 }),
  provider: varchar({ length: 50 }).notNull(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_provider").on(table.provider, table.providerId),
  index("idx_users_provider_id").on(table.provider, table.providerId),
]);

// ============================================================================
// Engagement Tables
// ============================================================================

export const bookRatings = pgTable("book_ratings", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  rating: integer().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_book_rating").on(table.userId, table.bookId),
  check("ck_rating_value", sql`rating IN (-1, 0, 1)`),
  index("idx_book_ratings_user_id").on(table.userId),
  index("idx_book_ratings_book_id").on(table.bookId),
]);

export const bookReviews = pgTable("book_reviews", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  reviewText: text("review_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_book_review").on(table.userId, table.bookId),
  index("idx_book_reviews_user_id").on(table.userId),
  index("idx_book_reviews_book_id").on(table.bookId),
]);

export const reviewLikes = pgTable("review_likes", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewId: integer("review_id").notNull().references(() => bookReviews.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_review_like").on(table.userId, table.reviewId),
  index("idx_review_likes_user_id").on(table.userId),
  index("idx_review_likes_review_id").on(table.reviewId),
]);

export const reviewReplies = pgTable("review_replies", {
  id: serial().primaryKey(),
  reviewId: integer("review_id").notNull().references(() => bookReviews.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  replyText: text("reply_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_review_replies_review_id").on(table.reviewId),
  index("idx_review_replies_user_id").on(table.userId),
]);

export const readingProgresses = pgTable("reading_progresses", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  sourceDomain: varchar("source_domain", { length: 255 }),
  sourceUrl: varchar("source_url", { length: 1000 }),
  chapterSeqOverride: integer("chapter_seq_override"),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_book_progress").on(table.userId, table.bookId),
  index("idx_reading_progresses_user_id").on(table.userId),
  index("idx_reading_progresses_book_id").on(table.bookId),
  index("idx_reading_progresses_chapter_id").on(table.chapterId),
  index("idx_reading_progresses_user_last_read").on(table.userId, table.lastReadAt),
]);

export const readingProgressHistories = pgTable("reading_progress_histories", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_reading_progress_histories_user_id").on(table.userId),
  index("idx_reading_progress_histories_book_id").on(table.bookId),
  index("idx_reading_progress_histories_recorded_at").on(table.recordedAt),
  index("idx_rph_community_ranking").on(table.recordedAt, table.bookId, table.userId),
]);

export const bookmarks = pgTable("bookmarks", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  status: varchar({ length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_book_bookmark").on(table.userId, table.bookId),
  index("idx_bookmarks_user_id").on(table.userId),
  index("idx_bookmarks_book_id").on(table.bookId),
  index("idx_bookmarks_user_created").on(table.userId, table.createdAt),
  index("idx_bookmarks_user_status").on(table.userId, table.status),
]);

export const bookLists = pgTable("book_lists", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  isPublic: integer("is_public").notNull().default(0),
  followerCount: integer("follower_count").notNull().default(0),
  itemCount: integer("item_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_book_lists_user_id").on(table.userId),
  index("idx_book_lists_public").on(table.isPublic),
]);

export const bookListItems = pgTable("book_list_items", {
  id: serial().primaryKey(),
  listId: integer("list_id").notNull().references(() => bookLists.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_list_book").on(table.listId, table.bookId),
  index("idx_book_list_items_list_id").on(table.listId),
  index("idx_book_list_items_book_id").on(table.bookId),
]);

export const bookListFollows = pgTable("book_list_follows", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  listId: integer("list_id").notNull().references(() => bookLists.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_list_follow").on(table.userId, table.listId),
  index("idx_book_list_follows_user_id").on(table.userId),
  index("idx_book_list_follows_list_id").on(table.listId),
]);

export const bookListItemLikes = pgTable("book_list_item_likes", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => bookListItems.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_item_like").on(table.userId, table.itemId),
  index("idx_book_list_item_likes_user_id").on(table.userId),
  index("idx_book_list_item_likes_item_id").on(table.itemId),
]);

// ============================================================================
// Community Tag Tables
// ============================================================================

export const tags = pgTable("tags", {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookTags = pgTable("book_tags", {
  id: serial().primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_book_tag_user").on(table.bookId, table.tagId, table.userId),
  index("idx_book_tags_book_id").on(table.bookId),
  index("idx_book_tags_tag_id").on(table.tagId),
  index("idx_book_tags_user_id").on(table.userId),
]);

export const booklistTags = pgTable("booklist_tags", {
  id: serial().primaryKey(),
  listId: integer("list_id").notNull().references(() => bookLists.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_booklist_tag_user").on(table.listId, table.tagId, table.userId),
  index("idx_booklist_tags_list_id").on(table.listId),
  index("idx_booklist_tags_tag_id").on(table.tagId),
  index("idx_booklist_tags_user_id").on(table.userId),
]);

// ============================================================================
// QQ User & Comment Tables
// ============================================================================

export const qqUsers = pgTable("qq_users", {
  id: serial().primaryKey(),
  uid: varchar({ length: 50 }).notNull().unique(),
  nickname: varchar({ length: 255 }),
  nicknameTranslated: varchar("nickname_translated", { length: 255 }),
  iconUrl: varchar("icon_url", { length: 500 }),
  isAuthor: integer("is_author"),
  centerAuthorId: integer("center_author_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_qq_users_uid").on(table.uid),
]);

// ============================================================================
// QQ Charts & Catalog Tables
// ============================================================================

export const qqChartEntries = pgTable("qq_chart_entries", {
  id: serial().primaryKey(),
  gender: varchar({ length: 10 }).notNull(),
  rankType: varchar("rank_type", { length: 20 }).notNull(),
  cycle: varchar({ length: 10 }).notNull(),
  position: integer().notNull(),
  page: integer().notNull().default(1),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_qq_chart_entries_lookup").on(table.gender, table.rankType, table.cycle, table.position),
  index("idx_qq_chart_entries_book_id").on(table.bookId),
]);

// ============================================================================
// Stats Tables (read-only, managed by Python Alembic)
// ============================================================================

export const bookStats = pgTable("book_stats", {
  bookId: integer("book_id").primaryKey().references(() => books.id, { onDelete: "cascade" }),
  chapterCount: integer("chapter_count").notNull().default(0),
  latestChapterNumber: integer("latest_chapter_number").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  ratingPositive: integer("rating_positive").notNull().default(0),
  ratingNegative: integer("rating_negative").notNull().default(0),
  ratingNeutral: integer("rating_neutral").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  readerCount: integer("reader_count").notNull().default(0),
  bookmarkCount: integer("bookmark_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookComments = pgTable("book_comments", {
  id: serial().primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  qqUserId: integer("qq_user_id").notNull().references(() => qqUsers.id, { onDelete: "cascade" }),
  title: text(),
  titleTranslated: text("title_translated"),
  content: text(),
  contentTranslated: text("content_translated"),
  images: text(),
  agreeCount: integer("agree_count").default(0),
  replyCount: integer("reply_count").default(0),
  commentCreatedAt: timestamp("comment_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_book_comments_book_id").on(table.bookId),
  index("idx_book_comments_qq_user_id").on(table.qqUserId),
  index("idx_book_comments_created_at").on(table.commentCreatedAt),
]);

// ============================================================================
// Notification Tables
// ============================================================================

export const notifications = pgTable("notifications", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  type: varchar({ length: 50 }).notNull(),
  metadata: text().notNull().default("{}"),
  read: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_notifications_user_read").on(table.userId, table.read),
  index("idx_notifications_user_created").on(table.userId, table.createdAt),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar({ length: 50 }).notNull(),
  enabled: boolean().notNull().default(true),
}, (table) => [
  unique("uq_notif_pref_user_type").on(table.userId, table.type),
  index("idx_notif_pref_user").on(table.userId),
]);

// ============================================================================
// Qidian Booklist Tables
// ============================================================================

export const qidianBooklists = pgTable("qidian_booklists", {
  id: serial().primaryKey(),
  qidiantuId: integer("qidiantu_id").notNull().unique(),
  title: varchar({ length: 500 }),
  titleTranslated: varchar("title_translated", { length: 500 }),
  description: text(),
  descriptionTranslated: text("description_translated"),
  tags: text().array(),
  tagsTranslated: text("tags_translated").array(),
  followerCount: integer("follower_count"),
  daosearchFollowerCount: integer("daosearch_follower_count").notNull().default(0),
  bookCount: integer("book_count"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
}, (table) => [
  index("idx_qidian_booklists_qidiantu_id").on(table.qidiantuId),
]);

export const qidianBooklistFollows = pgTable("qidian_booklist_follows", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  booklistId: integer("booklist_id").notNull().references(() => qidianBooklists.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_qidian_booklist_follow").on(table.userId, table.booklistId),
  index("idx_qidian_booklist_follows_user_id").on(table.userId),
  index("idx_qidian_booklist_follows_booklist_id").on(table.booklistId),
]);

export const qidianBooklistItems = pgTable("qidian_booklist_items", {
  id: serial().primaryKey(),
  booklistId: integer("booklist_id").notNull().references(() => qidianBooklists.id, { onDelete: "cascade" }),
  bookId: integer("book_id").references(() => books.id, { onDelete: "set null" }),
  qidianBookId: integer("qidian_book_id").notNull(),
  position: integer(),
  curatorComment: text("curator_comment"),
  curatorCommentTranslated: text("curator_comment_translated"),
  heartCount: integer("heart_count"),
  addedAt: timestamp("added_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_booklist_qidian_book").on(table.booklistId, table.qidianBookId),
  index("idx_qidian_booklist_items_booklist_id").on(table.booklistId),
  index("idx_qidian_booklist_items_book_id").on(table.bookId),
]);

// ============================================================================
// Reader Tables
// ============================================================================

export const bookSources = pgTable("book_sources", {
  id: serial().primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  domain: varchar({ length: 255 }).notNull(),
  novelUrl: varchar("novel_url", { length: 1000 }).notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_book_source_domain").on(table.bookId, table.domain),
  index("idx_book_sources_book_id").on(table.bookId),
]);

// ============================================================================
// Translation Tables
// ============================================================================

export const novelEntities = pgTable("novel_entities", {
  id: serial().primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  translatedName: varchar("translated_name", { length: 255 }).notNull(),

  gender: varchar({ length: 1 }).default("N"),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_novel_entity").on(table.bookId, table.originalName),
  index("idx_novel_entities_book_id").on(table.bookId),
]);

export const userGeneralEntities = pgTable("user_general_entities", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  translatedName: varchar("translated_name", { length: 255 }).notNull(),

  gender: varchar({ length: 1 }).default("N"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_general_entity").on(table.userId, table.originalName),
  index("idx_user_general_entities_user_id").on(table.userId),
]);

export const userEntityOverrides = pgTable("user_entity_overrides", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  novelEntityId: integer("novel_entity_id").notNull().references(() => novelEntities.id, { onDelete: "cascade" }),
  customName: varchar("custom_name", { length: 255 }).notNull(),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_entity_override").on(table.userId, table.novelEntityId),
  index("idx_user_entity_overrides_user_id").on(table.userId),
  index("idx_user_entity_overrides_entity_id").on(table.novelEntityId),
]);

export const userTranslationSettings = pgTable("user_translation_settings", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  tier: varchar({ length: 10 }).notNull().default("free"),
  byokEndpoint: varchar("byok_endpoint", { length: 500 }),
  byokModel: varchar("byok_model", { length: 100 }),
  byokKeyEnc: text("byok_key_enc"),
  byokKeyIv: varchar("byok_key_iv", { length: 32 }),
  customInstructions: text("custom_instructions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_user_translation_settings_user_id").on(table.userId),
]);

// ============================================================================
// Dao Reader Tables
// ============================================================================

export const translatedChapters = pgTable("translated_chapters", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterSeq: integer("chapter_seq").notNull(),
  translatedTitle: varchar("translated_title", { length: 500 }),
  translatedText: text("translated_text").notNull(),
  sourceDomain: varchar("source_domain", { length: 255 }),
  translatedAt: timestamp("translated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_translated_chapter").on(table.userId, table.bookId, table.chapterSeq),
  index("idx_translated_chapters_user_book").on(table.userId, table.bookId),
]);

export const userNovelEntities = pgTable("user_novel_entities", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  sourceTerm: varchar("source_term", { length: 255 }).notNull(),
  translatedTerm: varchar("translated_term", { length: 255 }).notNull(),
  gender: varchar({ length: 1 }).default("N"),
  category: varchar({ length: 50 }).default("character"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_user_novel_entity").on(table.userId, table.bookId, table.sourceTerm),
  index("idx_user_novel_entities_user_book").on(table.userId, table.bookId),
]);

