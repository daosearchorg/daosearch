export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "DaoSearch API",
    version: "1.0.0",
    description: "Public read-only API for DaoSearch — a web novel database with translations, rankings, and community data from Qidian (book.qq.com).\n\n**Rate Limits:** 30 requests per minute per IP address. Exceeding this returns HTTP 429.\n\n**Pagination:** All paginated endpoints are capped at page 200 (10,000 results max). This limit was introduced to prevent bot abuse causing excessive database load. If you need bulk data access, please reach out on Discord.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/books": {
      get: {
        operationId: "searchBooks",
        summary: "Search and browse books",
        description: "Full library search with filters for genre, word count, status, and more.",
        tags: ["Books"],
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search by title (original or translated)" },
          { name: "author", in: "query", schema: { type: "string" }, description: "Filter by author name" },
          { name: "genre", in: "query", schema: { type: "integer" }, description: "Filter by genre ID" },
          { name: "subgenre", in: "query", schema: { type: "integer" }, description: "Filter by subgenre ID" },
          { name: "sort", in: "query", schema: { type: "string", enum: ["updated", "newest", "popularity", "qq_score", "community_score", "word_count", "favorites", "fans", "bookmarks"] }, description: "Sort field (default: updated)" },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] }, description: "Sort order (default: desc)" },
          { name: "status", in: "query", schema: { type: "string" }, description: "Filter by book status" },
          { name: "gender", in: "query", schema: { type: "string", enum: ["male", "female"] }, description: "Filter by target audience" },
          { name: "minWords", in: "query", schema: { type: "integer" }, description: "Minimum word count" },
          { name: "maxWords", in: "query", schema: { type: "integer" }, description: "Maximum word count" },
          { name: "page", in: "query", schema: { type: "integer", default: 1, maximum: 200 }, description: "Page number (max 200)" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 }, description: "Items per page (1-50, default: 50)" },
        ],
        responses: {
          "200": { description: "Paginated list of books", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/books/{id}": {
      get: {
        operationId: "getBook",
        summary: "Get book details",
        description: "Returns full book details including translated metadata and aggregate stats.",
        tags: ["Books"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Book ID" },
        ],
        responses: {
          "200": { description: "Book detail with stats", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
          "404": { description: "Book not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/books/{id}/chapters": {
      get: {
        operationId: "getBookChapters",
        summary: "Get book chapters",
        description: "Paginated list of chapters with translated titles.",
        tags: ["Books"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Book ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
        ],
        responses: {
          "200": { description: "Paginated chapters", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/books/{id}/comments": {
      get: {
        operationId: "getBookComments",
        summary: "Get book comments",
        description: "Qidian user comments on a book, sorted by agree count.",
        tags: ["Books"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Book ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
        ],
        responses: {
          "200": { description: "Paginated comments", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/books/{id}/reviews": {
      get: {
        operationId: "getBookReviews",
        summary: "Get book reviews",
        description: "Community reviews written by DaoSearch users.",
        tags: ["Books"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Book ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
        ],
        responses: {
          "200": { description: "Paginated reviews", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/books/{id}/tags": {
      get: {
        operationId: "getBookTags",
        summary: "Get book tags",
        description: "Community-voted tags for a book.",
        tags: ["Books"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Book ID" },
        ],
        responses: {
          "200": { description: "List of tags with vote counts", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
        },
      },
    },
    "/books/{id}/recommendations": {
      get: {
        operationId: "getBookRecommendations",
        summary: "Get book recommendations",
        description: "Similar books recommended by Qidian for a given book, with stats.",
        tags: ["Books"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Book ID" },
        ],
        responses: {
          "200": { description: "List of recommended books with stats", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
          "404": { description: "Book not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/search": {
      get: {
        operationId: "quickSearch",
        summary: "Quick search",
        description: "Fast autocomplete search returning top 5 matching books.",
        tags: ["Search"],
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 }, description: "Search query (min 2 characters)" },
        ],
        responses: {
          "200": { description: "Top 5 matching books", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
        },
      },
    },
    "/rankings": {
      get: {
        operationId: "getRankings",
        summary: "Get Qidian rankings",
        description: "Official Qidian chart rankings by gender, type, and cycle.",
        tags: ["Rankings"],
        parameters: [
          { name: "gender", in: "query", schema: { type: "string", enum: ["male", "female", "publish"], default: "male" }, description: "Target audience" },
          { name: "type", in: "query", schema: { type: "string", enum: ["popular", "new", "free", "completed", "hall_of_fame", "knowledge"], default: "popular" }, description: "Ranking type" },
          { name: "cycle", in: "query", schema: { type: "string", default: "cycle-1" }, description: "Ranking cycle (e.g. cycle-1 through cycle-5)" },
          { name: "genre", in: "query", schema: { type: "integer" }, description: "Filter by genre ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 }, description: "Items per page (1-50, default: 49)" },
        ],
        responses: {
          "200": { description: "Paginated rankings", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/community-rankings": {
      get: {
        operationId: "getCommunityRankings",
        summary: "Get community rankings",
        description: "Rankings based on DaoSearch reader activity, by period.",
        tags: ["Rankings"],
        parameters: [
          { name: "period", in: "query", schema: { type: "string", enum: ["daily", "weekly", "monthly", "all-time"], default: "all-time" }, description: "Time period" },
          { name: "genre", in: "query", schema: { type: "integer" }, description: "Filter by genre ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 }, description: "Items per page (1-50, default: 49)" },
        ],
        responses: {
          "200": { description: "Paginated community rankings", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/genres": {
      get: {
        operationId: "getGenres",
        summary: "Get all genres",
        description: "All primary genres that have at least one book.",
        tags: ["Genres"],
        parameters: [],
        responses: {
          "200": { description: "List of genres", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
        },
      },
    },
    "/booklists": {
      get: {
        operationId: "getBooklists",
        summary: "Get Qidian booklists",
        description: "Curated booklists from Qidian with preview images.",
        tags: ["Booklists"],
        parameters: [
          { name: "sort", in: "query", schema: { type: "string", enum: ["popular", "recent", "largest"], default: "popular" }, description: "Sort order" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 }, description: "Items per page (1-50, default: 49)" },
        ],
        responses: {
          "200": { description: "Paginated booklists", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/booklists/{id}": {
      get: {
        operationId: "getBooklistDetail",
        summary: "Get booklist detail",
        description: "Single Qidian booklist with its books.",
        tags: ["Booklists"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "Booklist ID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
        ],
        responses: {
          "200": { description: "Booklist with paginated books", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
          "404": { description: "Booklist not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/feed": {
      get: {
        operationId: "getFeed",
        summary: "Get activity feed",
        description: "Global feed of Qidian comments or DaoSearch community activity.",
        tags: ["Feed"],
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: ["comments", "activity"], default: "comments" }, description: "Feed type: 'comments' for Qidian comments, 'activity' for DaoSearch user activity" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 }, description: "Items per page (1-50, default: 49)" },
        ],
        responses: {
          "200": { description: "Paginated feed items", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } },
        },
      },
    },
    "/stats": {
      get: {
        operationId: "getStats",
        summary: "Get database stats",
        description: "Aggregate statistics about books, chapters, translations, and community data.",
        tags: ["Stats"],
        parameters: [],
        responses: {
          "200": { description: "Database statistics", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      SuccessResponse: {
        type: "object",
        properties: {
          data: { description: "Response payload" },
        },
        required: ["data"],
      },
      PaginatedResponse: {
        type: "object",
        properties: {
          data: { description: "Array of items" },
          pagination: {
            type: "object",
            properties: {
              page: { type: "integer" },
              totalPages: { type: "integer" },
              total: { type: "integer" },
            },
            required: ["page", "totalPages", "total"],
          },
        },
        required: ["data", "pagination"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      },
    },
  },
} as const;
