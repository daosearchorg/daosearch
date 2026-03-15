import { notFound } from "next/navigation";
import { getBook } from "@/lib/queries";
import { ChapterReader } from "@/components/chapter-reader";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(Number(id));
  if (!book) return { title: "Not Found" };
  const title = book.titleTranslated || book.title || "Untitled";
  return { title: `Read — ${title}` };
}

export default async function ReadPage({ params, searchParams }: Props) {
  const { id } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) notFound();

  const book = await getBook(bookId);
  if (!book) notFound();

  const sp = await searchParams;
  const seq = sp.seq ? Number(sp.seq) : 1;

  return (
    <ChapterReader
      bookId={bookId}
      bookTitle={book.titleTranslated || book.title || "Untitled"}
      bookTitleRaw={book.title || ""}
      initialSeq={seq}
    />
  );
}
