import { BookCard } from "@/components/book-card";

interface LibraryItem {
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
  reviewCount: number | null;
  readerCount: number | null;
  wordCount?: number | null;
  qqScore?: string | null;
}

export function LibraryList({ items }: { items: LibraryItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <BookCard
          key={item.bookId}
          variant="list"
          title={item.titleTranslated}
          titleOriginal={item.title}
          author={item.authorTranslated}
          authorOriginal={item.author}
          imageUrl={item.imageUrl}
          synopsis={item.synopsisTranslated || item.synopsis}
          genreName={item.genreNameTranslated ?? item.genreName}
          bookId={item.bookId}
          stats={{
            commentCount: item.commentCount,
            ratingCount: item.ratingCount,
            ratingPositive: item.ratingPositive,
            ratingNeutral: item.ratingNeutral,
            ratingNegative: item.ratingNegative,
            reviewCount: item.reviewCount,
            readerCount: item.readerCount,
            wordCount: item.wordCount,
            qqScore: item.qqScore,
          }}
        />
      ))}
    </div>
  );
}
