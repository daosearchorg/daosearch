const BASE_URL = process.env.API_BASE_URL || "https://daosearch.io/api/v1";
console.log(`[API] Base URL: ${BASE_URL}`);

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    console.log(`[API] ${path}`);
    const res = await fetch(url.toString(), { signal: controller.signal });
    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const err = json.error as { code: string; message: string } | undefined;
      console.error(`[API] ${path} → ${res.status}`, err);
      throw new ApiError(res.status, err?.code || "UNKNOWN", err?.message || res.statusText);
    }

    return json as T;
  } catch (err) {
    console.error(`[API] ${path} failed:`, err instanceof ApiError ? err.message : err);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Normalize: some endpoints return bookId instead of id
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeBook(raw: any): BookSummary {
  return {
    ...raw,
    id: raw.id ?? raw.bookId,
  };
}

// Response types
export interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface DataResponse<T> {
  data: T;
}

export interface BookSummary {
  id: number;
  title: string;
  titleTranslated: string | null;
  author: string;
  authorTranslated: string | null;
  imageUrl: string | null;
  genreName: string | null;
  genreNameTranslated: string | null;
  wordCount: number | null;
  qqScore: number | null;
  status: string | null;
  statusTranslated: string | null;
}

export interface BookDetail extends BookSummary {
  url: string | null;
  synopsis: string | null;
  synopsisTranslated: string | null;
  updateTime: string | null;
  recommendationQqIds: number[] | null;
  stats?: {
    totalRatings: number;
    averageRating: number;
    totalReviews: number;
    totalBookmarks: number;
    totalFavorites: number;
    totalFans: number;
    communityScore: number;
  };
}

export interface Chapter {
  id: number;
  sequenceNumber: number;
  title: string;
  titleTranslated: string | null;
}

export interface Comment {
  id: number;
  content: string;
  contentTranslated: string | null;
  qqUserNickname: string;
  qqUserNicknameTranslated: string | null;
  agreeCount: number;
  commentCreatedAt: string;
}

export interface Review {
  id: number;
  reviewText: string;
  rating: number;
  likeCount: number;
  userDisplayName: string;
  createdAt: string;
}

export interface Tag {
  id: number;
  name: string;
  nameTranslated: string | null;
  voteCount: number;
}

export interface Genre {
  id: number;
  name: string;
  nameTranslated: string | null;
  bookCount: number;
}

export interface RankingItem {
  rank: number;
  book: BookSummary;
}

export interface Booklist {
  id: number;
  title: string;
  titleTranslated: string | null;
  description: string | null;
  descriptionTranslated: string | null;
  followerCount: number | null;
  bookCount: number;
  matchedBookCount: number;
  imageUrls: string[];
}

export interface Stats {
  books: { total: number; scraped: number; translated: number };
  chapters: { total: number; translated: number };
  comments: { total: number; translated: number };
  qqUsers: { total: number; translated: number };
  rankings: number;
  booklists: { total: number; translated: number; items: number };
  community: {
    users: number;
    reviews: number;
    ratingsGood: number;
    ratingsNeutral: number;
    ratingsBad: number;
    bookmarks: number;
    tags: number;
    tagVotes: number;
  };
}

// API functions
export async function search(q: string) {
  const result = await request<DataResponse<Record<string, unknown>[]>>("/search", { q });
  return { data: result.data.map(normalizeBook) };
}

export async function getBooks(params: {
  q?: string;
  author?: string;
  genre?: number;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  const result = await request<PaginatedResponse<Record<string, unknown>>>("/books", {
    q: params.q,
    author: params.author,
    genre: params.genre,
    sort: params.sort,
    page: params.page,
    limit: params.limit,
  });
  return {
    data: result.data.map(normalizeBook),
    pagination: result.pagination,
  };
}

export async function getBook(id: number) {
  const result = await request<DataResponse<Record<string, unknown>>>(`/books/${id}`);
  return { data: normalizeBook(result.data) as BookDetail };
}

export async function getBookChapters(id: number, page = 1) {
  return request<PaginatedResponse<Chapter>>(`/books/${id}/chapters`, { page });
}

export async function getBookComments(id: number, page = 1) {
  return request<PaginatedResponse<Comment>>(`/books/${id}/comments`, { page });
}

export async function getBookReviews(id: number, page = 1) {
  return request<PaginatedResponse<Review>>(`/books/${id}/reviews`, { page });
}

export async function getBookTags(id: number) {
  return request<DataResponse<Tag[]>>(`/books/${id}/tags`);
}

export async function getBookRecommendations(id: number) {
  const result = await request<DataResponse<Record<string, unknown>[]>>(`/books/${id}/recommendations`);
  return { data: result.data.map(normalizeBook) };
}

// Rankings return flat items with bookId + position, normalize to RankingItem
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRanking(raw: any, index: number, page: number): RankingItem {
  const rank = raw.position ?? ((page - 1) * 50 + index + 1);
  return {
    rank,
    book: normalizeBook(raw),
  };
}

export async function getRankings(params: {
  gender?: string;
  type?: string;
  cycle?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const result = await request<PaginatedResponse<Record<string, unknown>>>("/rankings", {
    gender: params.gender,
    type: params.type,
    cycle: params.cycle,
    page,
    limit: params.limit,
  });
  return {
    data: result.data.map((item, i) => normalizeRanking(item, i, page)),
    pagination: result.pagination,
  };
}

export async function getCommunityRankings(params: {
  period?: string;
  genre?: number;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const result = await request<PaginatedResponse<Record<string, unknown>>>("/community-rankings", {
    period: params.period,
    genre: params.genre,
    page,
    limit: params.limit,
  });
  return {
    data: result.data.map((item, i) => normalizeRanking(item, i, page)),
    pagination: result.pagination,
  };
}

export async function getGenres() {
  return request<DataResponse<Genre[]>>("/genres");
}

export async function getBooklists(params: { sort?: string; page?: number; limit?: number }) {
  return request<PaginatedResponse<Booklist>>("/booklists", {
    sort: params.sort,
    page: params.page,
    limit: params.limit,
  });
}

export async function getBooklistDetail(id: number, page = 1) {
  return request<PaginatedResponse<BookSummary> & { data: BookSummary[]; title: string; description: string }>(`/booklists/${id}`, { page });
}

export async function getFeed(type: "comments" | "activity" = "comments", page = 1) {
  return request<PaginatedResponse<unknown>>("/feed", { type, page });
}

export async function getStats() {
  return request<DataResponse<Stats>>("/stats");
}

export { ApiError };
