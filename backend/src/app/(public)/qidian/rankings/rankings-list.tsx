import { BookCard } from "@/components/book-card";

interface RankingItem {
  position: number;
  bookId: number;
  title: string | null;
  titleTranslated: string | null;
  author: string | null;
  authorTranslated: string | null;
  imageUrl: string | null;
  synopsis: string | null;
  synopsisTranslated: string | null;
  genreName: string | null;
  genreNameTranslated: string | null;
  commentCount: number | null;
  ratingCount: number | null;
  ratingPositive: number | null;
  ratingNeutral: number | null;
  ratingNegative: number | null;
  reviewCount?: number | null;
  readerCount?: number | null;
  wordCount?: number | null;
  qqScore?: string | null;
}

interface RankingsListProps {
  items: RankingItem[];
  showPodium?: boolean;
}

function itemStats(item: RankingItem) {
  return {
    commentCount: item.commentCount,
    ratingCount: item.ratingCount,
    ratingPositive: item.ratingPositive,
    ratingNeutral: item.ratingNeutral,
    ratingNegative: item.ratingNegative,
    reviewCount: item.reviewCount,
    readerCount: item.readerCount,
    wordCount: item.wordCount,
    qqScore: item.qqScore,
  };
}

function ItemCard({ item, variant }: { item: RankingItem; variant: "list" | "podium" }) {
  return (
    <BookCard
      variant={variant}
      position={item.position}
      title={item.titleTranslated}
      titleOriginal={item.title}
      author={item.authorTranslated}
      authorOriginal={item.author}
      imageUrl={item.imageUrl}
      synopsis={item.synopsisTranslated || item.synopsis}
      genreName={item.genreNameTranslated ?? item.genreName}
      bookId={item.bookId}
      stats={itemStats(item)}
    />
  );
}

function ListItems({ items }: { items: RankingItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <ItemCard key={item.position} item={item} variant="list" />
      ))}
    </div>
  );
}

export function RankingsList({ items, showPodium = true }: RankingsListProps) {
  if (!showPodium) {
    return <ListItems items={items} />;
  }

  const topItems = items.slice(0, 3);
  const restItems = items.slice(3);

  return (
    <>
      {/* Desktop: podium layout */}
      {topItems.length > 0 && (
        <>
          <div className="hidden sm:grid grid-cols-3 gap-6 items-end">
            {topItems[1] ? (
              <div className="pt-10">
                <ItemCard item={topItems[1]} variant="podium" />
              </div>
            ) : <div />}
            <ItemCard item={topItems[0]} variant="podium" />
            {topItems[2] ? (
              <div className="pt-10">
                <ItemCard item={topItems[2]} variant="podium" />
              </div>
            ) : <div />}
          </div>

          {/* Mobile: all items in one list */}
          <div className="flex flex-col gap-2 sm:hidden">
            {items.map((item) => (
              <ItemCard key={item.position} item={item} variant="list" />
            ))}
          </div>
        </>
      )}

      {/* Desktop: remaining items */}
      {restItems.length > 0 && (
        <div className="hidden sm:block">
          <ListItems items={restItems} />
        </div>
      )}
    </>
  );
}
