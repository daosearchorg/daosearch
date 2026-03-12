import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Trophy,
  TrendingUp,
  ListOrdered,
  Rss,
  Code2,
  Bot,
  MessageSquare,
  Cpu,
  Github,
  SmilePlus,
  Frown,
  Meh,
  MessageSquareText,
  MessageCircle,
  Bookmark,
  Glasses,
  ListChecks,
  Users,
  LibraryBig,
  ScrollText,
  Star,
  Flame,
  Clock,
  Search,
  BookOpen,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { getHomepageData } from "@/lib/queries";
import { DiscordIcon } from "@/components/icons/provider-icons";
import { UserAvatar } from "@/components/user-avatar";
import { bookUrl, booklistUrl, communityBooklistUrl, timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DragScroll } from "@/components/drag-scroll";
import { HeroSearch } from "@/components/hero-search";
import type { DaoSearchFeedItem } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 900;

export const metadata: Metadata = {
  title: "DaoSearch — Opensource Jade Slip for Raws",
  description:
    "Discover, rank, and track 870k+ web novels from Qidian. Browse rankings, booklists, translated comments, and community reviews — all in one place.",
};

function formatNumber(n: number): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
}

function formatWordCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return count.toString();
}

function qqScoreColor(score: string): string {
  const n = parseFloat(score);
  if (n >= 8) return "text-green-600 dark:text-green-500";
  if (n >= 5) return "text-amber-500";
  return "text-red-500";
}

function SectionHeader({
  title,
  href,
  icon: Icon,
  badge,
  badgeClassName,
}: {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-4 sm:size-5 text-muted-foreground" />
        <h2 className="text-lg sm:text-xl font-medium tracking-tight">{title}</h2>
        {badge && <Badge variant="secondary" className={badgeClassName || "text-[10px] font-medium"}>{badge}</Badge>}
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        View all
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking card — cover + stats (used for trending/community/top rated)
// ---------------------------------------------------------------------------

const PODIUM_BADGE: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-white",
  2: "bg-gradient-to-br from-zinc-300 to-zinc-400 text-white",
  3: "bg-gradient-to-br from-amber-500 to-amber-700 text-white",
};

interface RankItem {
  position: number;
  bookId: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
  genreName: string | null;
  genreNameTranslated: string | null;
  wordCount: number | null;
  qqScore: string | null;
}

function RankingCard({ item }: { item: RankItem }) {
  const displayTitle = item.titleTranslated || item.title || "Untitled";
  const displayAuthor = item.authorTranslated || item.author || "Unknown";
  const badgeColor = PODIUM_BADGE[item.position] ?? "bg-foreground/80 text-background";

  return (
    <Link
      href={bookUrl(item.bookId, item.titleTranslated || item.title)}
      className="block shrink-0 w-[130px] sm:w-[150px] group"
      draggable={false}
    >
      <div className="relative">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={displayTitle}
            width={150}
            height={200}
            className="rounded-xl object-cover w-full aspect-[3/4] transition-opacity group-hover:opacity-80 shadow-sm pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center rounded-xl bg-muted w-full aspect-[3/4] text-xs text-muted-foreground">
            No image
          </div>
        )}
        <span
          className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium shadow-md ring-2 ring-background ${badgeColor}`}
        >
          {item.position}
        </span>
      </div>
      <div className="mt-4 px-0.5 flex flex-col items-center text-center">
        <p className="text-sm font-medium line-clamp-2 leading-snug h-[2.625rem]">{displayTitle}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate max-w-full h-4">{displayAuthor}</p>
        <div className="flex items-center justify-center gap-2 mt-1.5 h-4 text-xs text-muted-foreground">
          {(item.wordCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <ScrollText className="size-3 shrink-0" />
              <span className="tabular-nums">{formatWordCount(item.wordCount!)}</span>
            </span>
          )}
          {item.qqScore && parseFloat(item.qqScore) > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 shrink-0" />
              <span className={`tabular-nums ${qqScoreColor(item.qqScore)}`}>{item.qqScore}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Feed helpers
// ---------------------------------------------------------------------------

function FeedActivityIcon({ type, ratingValue }: { type: string; ratingValue: number | null }) {
  if (type === "rating") {
    if (ratingValue === 1) return <SmilePlus className="size-4 text-green-500" />;
    if (ratingValue === -1) return <Frown className="size-4 text-red-400" />;
    return <Meh className="size-4 text-amber-500" />;
  }
  if (type === "review") return <MessageSquareText className="size-4 text-blue-500" />;
  if (type === "reply") return <MessageCircle className="size-4 text-indigo-500" />;
  if (type === "bookmark") return <Bookmark className="size-4 text-purple-500 fill-current" />;
  if (type === "list_follow") return <ListChecks className="size-4 text-teal-500" />;
  return <Glasses className="size-4 text-muted-foreground" />;
}

function feedActivityLabel(type: string, ratingValue: number | null): string {
  if (type === "rating") {
    if (ratingValue === 1) return "enjoyed this";
    if (ratingValue === -1) return "didn't enjoy this";
    return "it was okay";
  }
  if (type === "review") return "wrote a review";
  if (type === "reply") return "replied to a review";
  if (type === "bookmark") return "bookmarked";
  if (type === "list_follow") return "followed a booklist";
  return "is reading";
}

function getFeedItemHref(item: DaoSearchFeedItem): string {
  if (item.bookId) return bookUrl(item.bookId, item.bookTitle);
  if (item.listId && item.listType === "community")
    return communityBooklistUrl(item.listId, item.listName);
  if (item.listId && item.listType === "qidian") return booklistUrl(item.listId, item.listName);
  return "#";
}

function CompactFeedItem({ item }: { item: DaoSearchFeedItem }) {
  const href = getFeedItemHref(item);
  const isListActivity = item.activityType === "list_follow";
  const displayTitle = isListActivity
    ? item.listName || "Untitled list"
    : item.bookTitle || item.bookTitleOriginal || "Untitled";

  return (
    <div className="flex items-center gap-2.5 sm:gap-3 py-2.5 sm:py-3">
      <Link href={href} className="shrink-0">
        {item.bookImageUrl ? (
          <Image
            src={item.bookImageUrl}
            alt={displayTitle}
            width={40}
            height={53}
            className="rounded-md object-cover w-10 h-[53px] sm:w-11 sm:h-[58px]"
          />
        ) : (
          <div className="w-10 h-[53px] sm:w-11 sm:h-[58px] rounded-md bg-muted flex items-center justify-center text-[8px] text-muted-foreground">
            {isListActivity ? <ListChecks className="size-4 text-muted-foreground" /> : "No img"}
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="text-sm sm:text-base font-medium line-clamp-1 hover:underline underline-offset-2">
          {displayTitle}
        </Link>
        <div className="flex items-center gap-1.5 mt-1">
          <UserAvatar
            username={item.username || "?"}
            avatarUrl={item.avatarUrl}
            className="size-4 shrink-0"
            fallbackClassName="text-[8px]"
          />
          <span className="text-xs sm:text-sm text-muted-foreground truncate">{item.username}</span>
          <FeedActivityIcon type={item.activityType} ratingValue={item.ratingValue} />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {feedActivityLabel(item.activityType, item.ratingValue)}
          </span>
        </div>
      </div>
      {item.activityAt && (
        <span className="text-xs text-muted-foreground/70 shrink-0">{timeAgo(item.activityAt)}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI feature cards
// ---------------------------------------------------------------------------

const AI_FEATURES = [
  {
    icon: Code2,
    title: "Public API",
    description: "REST API with 15 endpoints — search, rankings, booklists, and more",
    href: "/api-docs",
    external: false,
  },
  {
    icon: Cpu,
    title: "MCP Server",
    description: "Model Context Protocol for Claude and other AI agents",
    href: "/api-docs#mcp-server",
    external: false,
  },
  {
    icon: Bot,
    title: "Discord Bot",
    description: "Slash commands for search, rankings, and recommendations",
    href: "/discord",
    external: false,
  },
  {
    icon: MessageSquare,
    title: "ChatGPT",
    description: "Custom GPT powered by our API for book discovery",
    href: "https://chatgpt.com/g/g-69b1c31a6d00819196df8e07dc4591a9-daosearch",
    external: true,
  },
];

// ---------------------------------------------------------------------------
// How it works steps
// ---------------------------------------------------------------------------

const HOW_IT_WORKS = [
  {
    icon: Search,
    title: "Discover",
    description: "Search 870k+ raws, browse trending charts, or check what others are reading — like MAL for raw web novels",
  },
  {
    icon: BookOpen,
    title: "Track",
    description: "Bookmark what you're reading, rate it, leave reviews — build your personal library and share it with others",
  },
  {
    icon: BarChart3,
    title: "Explore",
    description: "Read translated Qidian comments, compare books side-by-side, or ask our ChatGPT and Discord bot for recs",
  },
];

// ===========================================================================
// Page
// ===========================================================================

export default async function Home() {
  const data = await getHomepageData();

  const statItems = [
    { label: "Books", value: data.stats.books.total },
    { label: "Chapters", value: data.stats.chapters.total },
    { label: "Comments", value: data.stats.comments.total },
    { label: "Booklists", value: data.stats.booklists.total },
    { label: "Ratings", value: data.stats.qqRatings || 0 },
    { label: "Users", value: data.stats.community.users },
  ];

  return (
    <div className="flex flex-col">
      {/* ================================================================= */}
      {/* Hero — title, subtitle, search, CTAs                              */}
      {/* ================================================================= */}
      <section className="flex flex-col items-center justify-center gap-4 sm:gap-5 px-5 pt-8 pb-8 sm:pt-12 sm:pb-14 text-center">
        <h1 className="text-3xl sm:text-5xl font-medium tracking-tight">DaoSearch</h1>
        <p className="text-base sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
          Opensource Jade Slip for Raws
        </p>
        <HeroSearch />
        <div className="flex items-center justify-center gap-2.5 sm:gap-3">
          <a
            href="https://discord.gg/Gmd3JXDuEU"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2 sm:px-5 sm:py-2.5 text-sm font-medium text-white hover:bg-[#4752C4] transition-colors"
          >
            <DiscordIcon className="size-4" />
            <span><span className="hidden sm:inline">Join our </span>Discord</span>
          </a>
          <a
            href="https://github.com/daosearchorg/daosearch"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 sm:px-5 sm:py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Github className="size-4" />
            <span><span className="hidden sm:inline">Star on </span>GitHub</span>
          </a>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Stats Bar                                                         */}
      {/* ================================================================= */}
      <section className="mx-auto w-full max-w-4xl px-5 sm:px-6 pb-8 sm:pb-14">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-6">
          {statItems.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-0.5 sm:gap-1">
              <span className="text-xl sm:text-3xl font-medium tabular-nums tracking-tight">
                {formatNumber(stat.value)}
              </span>
              <span className="text-[11px] sm:text-sm text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ================================================================= */}
      {/* Genre Quick Browse                                                */}
      {/* ================================================================= */}
      {data.genres.length > 0 && (
        <section className="mx-auto w-full max-w-6xl sm:px-6 pb-10 sm:pb-14">
          <div className="flex sm:flex-wrap sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto px-5 sm:px-0 pb-1 sm:pb-0 sm:overflow-visible">
            {data.genres.map((genre) => (
              <Link
                key={genre.id}
                href={`/library?genre=${genre.id}&page=1`}
                className="inline-flex items-center shrink-0 rounded-full bg-secondary px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                {genre.nameTranslated ?? genre.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* Content sections                                                  */}
      {/* ================================================================= */}
      <div className="flex flex-col gap-12 sm:gap-16 pb-10 sm:pb-16">

        {/* ── ACT 1: What's hot ─────────────────────────────────────────── */}

        {/* Qidian Trending Male */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Qidian Trending" href="/qidian/rankings?gender=male&cycle=cycle-2" icon={Trophy} badge="Male" badgeClassName="text-[10px] font-medium border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" />
          <div className="-mx-5 sm:-mx-6">
            <DragScroll className="flex gap-3 sm:gap-5 overflow-x-auto px-5 sm:px-6 pb-2 cursor-grab select-none">
              {data.rankingsMale.map((item) => (
                <RankingCard
                  key={item.bookId}
                  item={{
                    position: item.position,
                    bookId: item.bookId,
                    title: item.title,
                    titleTranslated: item.titleTranslated,
                    author: item.author,
                    authorTranslated: item.authorTranslated,
                    imageUrl: item.imageUrl,
                    genreName: item.genreName,
                    genreNameTranslated: item.genreNameTranslated,
                    wordCount: item.wordCount,
                    qqScore: item.qqScore,
                  }}
                />
              ))}
            </DragScroll>
          </div>
        </section>

        {/* Qidian Trending Female */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Qidian Trending" href="/qidian/rankings?gender=female&cycle=cycle-2" icon={Trophy} badge="Female" badgeClassName="text-[10px] font-medium border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300" />
          <div className="-mx-5 sm:-mx-6">
            <DragScroll className="flex gap-3 sm:gap-5 overflow-x-auto px-5 sm:px-6 pb-2 cursor-grab select-none">
              {data.rankingsFemale.map((item) => (
                <RankingCard
                  key={item.bookId}
                  item={{
                    position: item.position,
                    bookId: item.bookId,
                    title: item.title,
                    titleTranslated: item.titleTranslated,
                    author: item.author,
                    authorTranslated: item.authorTranslated,
                    imageUrl: item.imageUrl,
                    genreName: item.genreName,
                    genreNameTranslated: item.genreNameTranslated,
                    wordCount: item.wordCount,
                    qqScore: item.qqScore,
                  }}
                />
              ))}
            </DragScroll>
          </div>
        </section>

        {/* ── INTERMISSION: What is this? ───────────────────────────────── */}

        {/* How It Works */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-4 sm:gap-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 sm:size-5 text-muted-foreground" />
            <h2 className="text-lg sm:text-xl font-medium tracking-tight">How It Works</h2>
          </div>
          <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2.5 sm:gap-4">
            {HOW_IT_WORKS.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.title} className="p-3 sm:p-5 flex sm:flex-col items-start gap-3 sm:gap-3">
                  <div className="rounded-lg border p-2 sm:p-2.5 shrink-0">
                    <Icon className="size-4 sm:size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-medium">{step.title}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 leading-relaxed">{step.description}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── ACT 2: Go deeper ──────────────────────────────────────────── */}

        {/* Top Rated — cover grid */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Top Rated on Qidian" href="/qidian/rankings?cycle=cycle-4&page=1" icon={Flame} />
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
            {data.topRated.map((item, idx) => {
              const displayTitle = item.titleTranslated || item.title || "Untitled";
              const displayAuthor = item.authorTranslated || item.author || "Unknown";
              const badgeColor = PODIUM_BADGE[item.position] ?? "bg-foreground/80 text-background";
              return (
                <Link
                  key={item.bookId}
                  href={bookUrl(item.bookId, item.titleTranslated || item.title)}
                  className={`group${idx >= 8 ? " hidden sm:block" : ""}`}
                >
                  <div className="relative">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={displayTitle}
                        width={120}
                        height={160}
                        className="rounded-lg object-cover w-full aspect-[3/4] transition-opacity group-hover:opacity-80 shadow-sm"
                      />
                    ) : (
                      <div className="flex items-center justify-center rounded-lg bg-muted w-full aspect-[3/4] text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center w-5.5 h-5.5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-[11px] font-medium shadow-md ring-2 ring-background ${badgeColor}`}>
                      {item.position}
                    </span>
                  </div>
                  <div className="mt-3 px-0.5">
                    <p className="text-xs sm:text-sm font-medium line-clamp-2 leading-snug h-[2rem] sm:h-[2.625rem]">{displayTitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate hidden sm:block sm:h-4">{displayAuthor}</p>
                    <div className="flex items-center gap-2 mt-0.5 sm:mt-1 h-4 text-[11px] sm:text-xs text-muted-foreground">
                      {item.qqScore && parseFloat(item.qqScore) > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="size-2.5 sm:size-3" />
                          <span className={`tabular-nums ${qqScoreColor(item.qqScore)}`}>{item.qqScore}</span>
                        </span>
                      )}
                      {(item.wordCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 hidden sm:inline-flex">
                          <ScrollText className="size-3" />
                          <span className="tabular-nums">{formatWordCount(item.wordCount!)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Booklists — stacked full-width cards */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Latest Booklists" href="/qidian/booklists" icon={ListOrdered} />
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            {data.booklists.map((item) => {
              const title = item.titleTranslated || item.title || "Untitled booklist";
              const description =
                item.descriptionTranslated || item.description || "No description available yet.";
              return (
                <Link
                  key={item.id}
                  href={booklistUrl(item.id, item.titleTranslated || item.title)}
                  className="group"
                >
                  <Card className="p-3.5 sm:p-5 h-full flex flex-col gap-2.5 sm:gap-3 transition-colors group-hover:bg-accent/50">
                    <h3 className="text-sm sm:text-base font-medium line-clamp-2 leading-tight">{title}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3 shrink-0" />
                        <span className="tabular-nums">{formatNumber(item.followerCount ?? 0)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <LibraryBig className="size-3 shrink-0" />
                        <span className="tabular-nums">{item.bookCount ?? 0}</span> books
                      </span>
                      {(item.lastUpdatedAt || item.updatedAt) && (
                        <span className="ml-auto text-muted-foreground/60">
                          {timeAgo(item.lastUpdatedAt ?? item.updatedAt)}
                        </span>
                      )}
                    </div>
                    {item.previews && item.previews.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-auto">
                        {item.previews.slice(0, 4).map((preview) => {
                          const previewTitle = preview.titleTranslated || preview.title || "Untitled";
                          return (
                            <div key={`${item.id}-${preview.bookId}`} className="min-w-0">
                              <div className="relative overflow-hidden rounded-lg bg-muted">
                                {preview.imageUrl ? (
                                  <Image
                                    src={preview.imageUrl}
                                    alt={previewTitle}
                                    width={100}
                                    height={133}
                                    className="aspect-[3/4] w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex aspect-[3/4] w-full items-center justify-center text-[10px] text-muted-foreground">
                                    No img
                                  </div>
                                )}
                              </div>
                              <p className="mt-1.5 line-clamp-1 text-[11px] leading-tight text-muted-foreground hidden sm:block">
                                {previewTitle}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Community Rankings — compact numbered list */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Community Rankings" href="/daosearch/rankings" icon={TrendingUp} badge="Weekly" />
          <div className="divide-y divide-border/40">
            {data.communityRankings.map((item) => {
              const displayTitle = item.titleTranslated || item.title || "Untitled";
              const displayAuthor = item.authorTranslated || item.author || "Unknown";
              const badgeColor = PODIUM_BADGE[item.position] ?? "bg-foreground/80 text-background";
              return (
                <Link
                  key={item.bookId}
                  href={bookUrl(item.bookId, item.titleTranslated || item.title)}
                  className="flex items-center gap-3 py-2.5 sm:py-3 group"
                >
                  <div className="relative shrink-0">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={displayTitle}
                        width={40}
                        height={53}
                        className="rounded-md object-cover w-10 h-[53px] sm:w-11 sm:h-[58px]"
                      />
                    ) : (
                      <div className="w-10 h-[53px] sm:w-11 sm:h-[58px] rounded-md bg-muted" />
                    )}
                    <span className={`absolute -top-1.5 -left-1.5 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium shadow-sm ring-1.5 ring-background ${badgeColor}`}>
                      {item.position}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base font-medium line-clamp-1 group-hover:underline underline-offset-2">{displayTitle}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">{displayAuthor}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 text-xs sm:text-sm text-muted-foreground">
                    {(item.wordCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 hidden sm:inline-flex">
                        <ScrollText className="size-3 sm:size-3.5" />
                        <span className="tabular-nums">{formatWordCount(item.wordCount!)}</span>
                      </span>
                    )}
                    {item.qqScore && parseFloat(item.qqScore) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="size-3 sm:size-3.5" />
                        <span className={`tabular-nums ${qqScoreColor(item.qqScore)}`}>{item.qqScore}</span>
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── ACT 3: The community is alive ─────────────────────────────── */}

        {/* Latest Activity */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Latest Activity" href="/daosearch/feed" icon={Rss} />
          {data.feed.length > 0 ? (
            <div className="divide-y divide-border/40">
              {data.feed.map((item, i) => (
                <CompactFeedItem
                  key={`${item.activityType}-${item.bookId}-${item.listId}-${item.username}-${i}`}
                  item={item}
                />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">No activity yet.</p>
          )}
        </section>

        {/* Recently Updated — cover grid */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <SectionHeader title="Recently Updated" href="/library?sort=updated&page=1" icon={Clock} />
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
            {data.recentlyUpdated.map((item, idx) => {
              const displayTitle = item.titleTranslated || item.title || "Untitled";
              const displayAuthor = item.authorTranslated || item.author || "Unknown";
              return (
                <Link
                  key={item.bookId}
                  href={bookUrl(item.bookId, item.titleTranslated || item.title)}
                  className={`group${idx >= 8 ? " hidden sm:block" : ""}`}
                >
                  <div className="relative">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={displayTitle}
                        width={120}
                        height={160}
                        className="rounded-lg object-cover w-full aspect-[3/4] transition-opacity group-hover:opacity-80 shadow-sm"
                      />
                    ) : (
                      <div className="flex items-center justify-center rounded-xl bg-muted w-full aspect-[3/4] text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="mt-2 px-0.5">
                    <p className="text-xs sm:text-sm font-medium line-clamp-2 leading-snug h-[2rem] sm:h-[2.625rem]">{displayTitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate hidden sm:block sm:h-4">{displayAuthor}</p>
                    {item.updateTime && (
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-0.5">{timeAgo(item.updateTime)}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Qidian Comments — hidden on mobile */}
        <section className="hidden sm:flex mx-auto w-full max-w-6xl px-5 sm:px-6 flex-col gap-3 sm:gap-5">
          <SectionHeader title="Qidian Comments" href="/qidian/feed" icon={MessageSquareText} badge="Latest" />
          {data.topComments.length > 0 ? (
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.topComments.map((comment) => {
                const body = comment.contentTranslated || comment.content || "";
                let commentImages: string[] = [];
                try {
                  const parsed = JSON.parse(comment.images ?? "[]") as Array<string | { url: string }>;
                  commentImages = parsed
                    .map((img) => (typeof img === "string" ? img : img.url))
                    .filter(Boolean)
                    .slice(0, 3);
                } catch { /* ignore */ }

                return (
                  <Link key={comment.id} href={bookUrl(comment.bookId, comment.bookTitle)}>
                    <Card className="p-3.5 sm:p-4 h-full flex flex-col gap-2 sm:gap-2.5 transition-colors hover:bg-accent/50">
                      <div className="flex items-center gap-2.5">
                        {comment.bookImageUrl ? (
                          <Image
                            src={comment.bookImageUrl}
                            alt={comment.bookTitle || ""}
                            width={32}
                            height={42}
                            className="rounded-md object-cover w-8 h-[42px] shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-[42px] rounded-md bg-muted shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium line-clamp-1 leading-tight">
                            {comment.bookTitle || comment.bookTitleOriginal || "Untitled"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {comment.qqUserIconUrl ? (
                              <Image
                                src={comment.qqUserIconUrl}
                                alt=""
                                width={14}
                                height={14}
                                className="rounded-full size-3.5 object-cover shrink-0"
                              />
                            ) : (
                              <div className="size-3.5 rounded-full bg-muted shrink-0" />
                            )}
                            <span className="text-xs text-muted-foreground truncate">
                              {comment.qqUserNicknameTranslated || comment.qqUserNickname || "Anonymous"}
                            </span>
                            <span className="text-xs text-muted-foreground/60 ml-auto shrink-0">
                              {timeAgo(comment.commentCreatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {comment.titleTranslated && (
                        <p className="text-xs font-medium italic tracking-tight line-clamp-1">
                          {comment.titleTranslated}
                        </p>
                      )}
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 whitespace-pre-line leading-relaxed">
                        {body}
                      </p>
                      {commentImages.length > 0 && (
                        <div className="hidden sm:flex gap-2 mt-0.5">
                          {commentImages.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              className="rounded-lg h-24 w-auto max-w-[120px] object-cover border"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">No comments yet.</p>
          )}
        </section>

        {/* ── CLOSING: Build with us ────────────────────────────────────── */}

        {/* AI & Developer Features */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-6 flex flex-col gap-3 sm:gap-5">
          <h2 className="text-lg sm:text-xl font-medium tracking-tight">Built for Humans and AI</h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {AI_FEATURES.map((feature) => {
              const Icon = feature.icon;
              const linkProps = feature.external
                ? { target: "_blank" as const, rel: "noopener noreferrer" }
                : {};
              return (
                <Link key={feature.title} href={feature.href} {...linkProps}>
                  <Card className="p-3 sm:p-5 h-full flex flex-col gap-2 sm:gap-3 transition-colors hover:bg-accent/50">
                    <div className="rounded-lg border p-2 sm:p-2.5 w-fit">
                      <Icon className="size-4 sm:size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-medium">{feature.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 leading-relaxed line-clamp-2 sm:line-clamp-none">
                        {feature.description}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
