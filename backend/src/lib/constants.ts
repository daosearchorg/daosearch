// Gender configuration
export const GENDERS = ["male", "female", "publish"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  publish: "Published",
};

// Rank types per gender (matches scraper charts_scraper.py:31-35)
export const GENDER_RANK_TYPES: Record<Gender, string[]> = {
  male: ["popular", "new", "free", "completed", "hall_of_fame"],
  female: ["popular", "new", "free", "completed", "hall_of_fame"],
  publish: ["popular", "new", "knowledge"],
};

export const RANK_TYPE_LABELS: Record<string, string> = {
  popular: "Trending",
  new: "Rising",
  free: "Free",
  completed: "Finished",
  hall_of_fame: "All-Time",
  knowledge: "Knowledge",
};

// Category ID → English name mappings (from charts_scraper.py:39-78)
export const MALE_CATEGORIES: Record<number, string> = {
  20001: "Xuanhuan",
  20014: "Xianxia",
  20019: "Urban",
  20042: "Sci-fi",
  20037: "Suspense",
  20028: "History",
  20005: "Fantasy",
  20010: "Wuxia",
  20065: "Reality",
  20032: "Military",
  20050: "Game",
  20059: "Light Novel",
  20054: "Sports",
  20109: "Multi-verse",
  20076: "Short",
};

export const FEMALE_CATEGORIES: Record<number, string> = {
  30013: "Ancient Romance",
  30020: "Modern Romance",
  30001: "Fantasy Romance",
  30008: "Xianxia",
  30031: "Youth Romance",
  30050: "Game",
  30042: "Sci-fi",
  30036: "Suspense",
  30055: "Light Novel",
  30083: "Short",
  30120: "Reality",
};

export const PUBLISH_CATEGORIES: Record<number, string> = {
  13100: "Novel",
  14100: "Literature",
  13400: "Inspirational",
  14400: "History",
  14300: "Biography",
  14000: "Psychology",
};

export const ALL_CATEGORIES: Record<number, string> = {
  ...MALE_CATEGORIES,
  ...FEMALE_CATEGORIES,
  ...PUBLISH_CATEGORIES,
};

// Per-rank-type available cycles (must match scraper RANK_TYPE_CYCLES)
export const RANK_TYPE_CYCLES: Record<string, string[]> = {
  popular: ["cycle-1", "cycle-2", "cycle-3", "cycle-4", "cycle-5"],
  new: ["cycle-1", "cycle-2"],
  free: ["cycle-1"],
  completed: ["cycle-1", "cycle-2"],
  hall_of_fame: ["cycle-1", "cycle-2", "cycle-3", "cycle-4"],
  knowledge: ["cycle-1"],
};

// Publish only supports cycle-1 for all rank types
export const PUBLISH_RANK_TYPE_CYCLES: Record<string, string[]> = {
  popular: ["cycle-1"],
  new: ["cycle-1"],
  knowledge: ["cycle-1"],
};

// Cycle labels — vary by rank type
export const CYCLE_LABELS: Record<string, string> = {
  // popular cycles
  "cycle-1": "< 30 Days",
  "cycle-2": "< 120 Days",
  "cycle-3": "< 300 Days",
  "cycle-4": "300+ Days",
  "cycle-5": "All Books",
};

// Rank-type-specific cycle labels (override generic labels above)
export const RANK_TYPE_CYCLE_LABELS: Record<string, Record<string, string>> = {
  popular: {
    "cycle-1": "< 30 Days",
    "cycle-2": "< 120 Days",
    "cycle-3": "< 300 Days",
    "cycle-4": "300+ Days",
    "cycle-5": "All Books",
  },
  new: {
    "cycle-1": "Monthly",
    "cycle-2": "Seasonal",
  },
  free: {
    "cycle-1": "All",
  },
  completed: {
    "cycle-1": "Latest",
    "cycle-2": "Overall",
  },
  hall_of_fame: {
    "cycle-1": "2021",
    "cycle-2": "2020",
    "cycle-3": "2019",
    "cycle-4": "2018",
  },
  knowledge: {
    "cycle-1": "All",
  },
};

export const PAGE_SIZE = 20;
export const REVIEWS_PAGE_SIZE = 10;
export const PAGINATION_SIZE = 50;
export const LIBRARY_PAGE_SIZE = 50;

// Library sort options
export const LIBRARY_SORT_OPTIONS = [
  { value: "updated", label: "Last Updated", source: null },
  { value: "newest", label: "Newest Added", source: null },
  { value: "popularity", label: "Most Read", source: null },
  { value: "word_count", label: "Word Count", source: null },
  { value: "community_score", label: "Score", source: "community" },
  { value: "bookmarks", label: "Bookmarks", source: "community" },
  { value: "qq_score", label: "Score", source: "qidian" },
  { value: "favorites", label: "Favorites", source: "qidian" },
  { value: "fans", label: "Fans", source: "qidian" },
] as const;

export type LibrarySort = (typeof LIBRARY_SORT_OPTIONS)[number]["value"];

export const POPULARITY_PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "all_time", label: "All Time" },
] as const;

export type PopularityPeriod = (typeof POPULARITY_PERIOD_OPTIONS)[number]["value"];

export const TIME_FILTER_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
] as const;
