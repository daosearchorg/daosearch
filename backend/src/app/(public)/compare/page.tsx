import type { Metadata } from "next";
import { getBook, getBookStats, getBookTags, getReaderOverlap, getPopularBooksForCompare } from "@/lib/queries";
import { CompareView } from "@/components/compare/view";
import { ComparePicker } from "@/components/compare/picker";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const ids = (params.books ?? "").split(",").map(Number).filter(Boolean);

  if (ids.length === 2) {
    const [a, b] = await Promise.all([getBook(ids[0]), getBook(ids[1])]);
    if (a && b) {
      const nameA = a.titleTranslated || a.title || "Book A";
      const nameB = b.titleTranslated || b.title || "Book B";
      return {
        title: `${nameA} vs ${nameB}`,
        description: `Side-by-side comparison of ${nameA} and ${nameB} on DaoSearch`,
      };
    }
  }

  return {
    title: "Compare",
    description: "Compare two web novels side-by-side on DaoSearch",
  };
}

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const ids = (params.books ?? "").split(",").map(Number).filter(Boolean);

  if (ids.length < 2) {
    const popularBooks = await getPopularBooksForCompare();
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl sm:text-4xl font-medium tracking-tight text-center">Compare</h1>
          <p className="text-sm text-muted-foreground">Compare two books side-by-side — stats, ratings, readers, and tags.</p>
        </div>
        <ComparePicker bookIds={ids} popularBooks={popularBooks} />
      </div>
    );
  }

  const [bookA, bookB, statsA, statsB, tagsA, tagsB, overlap] = await Promise.all([
    getBook(ids[0]),
    getBook(ids[1]),
    getBookStats(ids[0]),
    getBookStats(ids[1]),
    getBookTags(ids[0]),
    getBookTags(ids[1]),
    getReaderOverlap(ids[0], ids[1]),
  ]);

  if (!bookA || !bookB) {
    const popularBooks = await getPopularBooksForCompare();
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl sm:text-4xl font-medium tracking-tight text-center">Compare</h1>
          <p className="text-sm text-muted-foreground">One or both books were not found.</p>
        </div>
        <ComparePicker bookIds={[]} popularBooks={popularBooks} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <CompareView
        bookA={bookA}
        bookB={bookB}
        statsA={statsA}
        statsB={statsB}
        tagsA={tagsA}
        tagsB={tagsB}
        overlap={overlap}
      />
    </div>
  );
}
