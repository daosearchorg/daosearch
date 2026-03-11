import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getLibraryBooks,
  getBook,
  getBookStats,
  getBookChapters,
  getBookComments,
  getBookReviews,
  getBookTags,
  quickSearchBooks,
  getRankings,
  getPrimaryGenres,
  getQidianBooklists,
  getQidianBooklistDetail,
  getCommunityRankings,
  getBookRecommendationsWithStats,
  getLatestQidianComments,
  getDaoSearchFeed,
  getDbStats,
} from "@/lib/queries";

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const tools: ToolDef[] = [
  {
    name: "search_books",
    description: "Search and browse books with filters for genre, word count, status, and more",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search by title" },
        author: { type: "string", description: "Filter by author" },
        genre: { type: "number", description: "Genre ID" },
        sort: { type: "string", description: "Sort: updated, newest, popularity, qq_score, community_score, word_count" },
        page: { type: "number", description: "Page number (default 1)" },
      },
    },
    handler: async (args) => {
      return getLibraryBooks({
        name: args.q as string | undefined,
        author: args.author as string | undefined,
        genreId: args.genre as number | undefined,
        sort: (args.sort as "updated") || "updated",
        page: (args.page as number) || 1,
      });
    },
  },
  {
    name: "get_book",
    description: "Get full book details with stats by book ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Book ID" },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const id = args.id as number;
      const [book, stats] = await Promise.all([getBook(id), getBookStats(id)]);
      if (!book) return { error: "Book not found" };
      return { ...book, stats };
    },
  },
  {
    name: "get_book_chapters",
    description: "Get paginated chapters for a book",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Book ID" },
        page: { type: "number", description: "Page number" },
      },
      required: ["id"],
    },
    handler: async (args) => getBookChapters(args.id as number, (args.page as number) || 1),
  },
  {
    name: "get_book_comments",
    description: "Get Qidian user comments for a book",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Book ID" },
        page: { type: "number", description: "Page number" },
      },
      required: ["id"],
    },
    handler: async (args) => getBookComments(args.id as number, (args.page as number) || 1),
  },
  {
    name: "get_book_reviews",
    description: "Get community reviews for a book",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Book ID" },
        page: { type: "number", description: "Page number" },
      },
      required: ["id"],
    },
    handler: async (args) => getBookReviews(args.id as number, (args.page as number) || 1),
  },
  {
    name: "get_book_tags",
    description: "Get community-voted tags for a book",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Book ID" },
      },
      required: ["id"],
    },
    handler: async (args) => getBookTags(args.id as number),
  },
  {
    name: "quick_search",
    description: "Fast autocomplete search returning top 5 matching books",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query (min 2 characters)" },
      },
      required: ["q"],
    },
    handler: async (args) => quickSearchBooks(args.q as string),
  },
  {
    name: "get_rankings",
    description: "Get Qidian chart rankings by gender, type, and cycle",
    inputSchema: {
      type: "object",
      properties: {
        gender: { type: "string", description: "male, female, or publish" },
        type: { type: "string", description: "popular, new, free, completed, hall_of_fame, knowledge" },
        cycle: { type: "string", description: "cycle-1 through cycle-5" },
        page: { type: "number", description: "Page number" },
      },
    },
    handler: async (args) =>
      getRankings({
        gender: (args.gender as string) || "male",
        rankType: (args.type as string) || "popular",
        cycle: (args.cycle as string) || "cycle-1",
        page: (args.page as number) || 1,
      }),
  },
  {
    name: "get_community_rankings",
    description: "Get community rankings based on DaoSearch reader activity",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "daily, weekly, monthly, or all-time" },
        genre: { type: "number", description: "Genre ID" },
        page: { type: "number", description: "Page number" },
      },
    },
    handler: async (args) =>
      getCommunityRankings({
        period: ((args.period as string) || "all-time") as "all-time",
        page: (args.page as number) || 1,
        genreId: args.genre as number | undefined,
      }),
  },
  {
    name: "get_book_recommendations",
    description: "Get similar books recommended by Qidian for a given book",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Book ID" },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const book = await getBook(args.id as number);
      if (!book) return { error: "Book not found" };
      const qqIds = (book.recommendationQqIds as number[]) ?? [];
      if (qqIds.length === 0) return [];
      return getBookRecommendationsWithStats(qqIds);
    },
  },
  {
    name: "get_genres",
    description: "Get all genres that have at least one book",
    inputSchema: { type: "object", properties: {} },
    handler: async () => getPrimaryGenres(),
  },
  {
    name: "get_booklists",
    description: "Get curated Qidian booklists",
    inputSchema: {
      type: "object",
      properties: {
        sort: { type: "string", description: "popular, recent, or largest" },
        page: { type: "number", description: "Page number" },
      },
    },
    handler: async (args) =>
      getQidianBooklists({
        sort: ((args.sort as string) || "popular") as "popular",
        page: (args.page as number) || 1,
      }),
  },
  {
    name: "get_booklist_detail",
    description: "Get a single Qidian booklist with its books",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Booklist ID" },
        page: { type: "number", description: "Page number" },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const result = await getQidianBooklistDetail(args.id as number, (args.page as number) || 1);
      if (!result) return { error: "Booklist not found" };
      return result;
    },
  },
  {
    name: "get_feed",
    description: "Get global activity feed (Qidian comments or DaoSearch community activity)",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "comments or activity" },
        page: { type: "number", description: "Page number" },
      },
    },
    handler: async (args) => {
      const page = (args.page as number) || 1;
      if (args.type === "activity") return getDaoSearchFeed(page);
      return getLatestQidianComments(page);
    },
  },
  {
    name: "get_stats",
    description: "Get aggregate database statistics about books, chapters, translations, and community",
    inputSchema: { type: "object", properties: {} },
    handler: async () => getDbStats(),
  },
];

export function createMcpServer() {
  const server = new Server(
    { name: "daosearch", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  });

  return server;
}
