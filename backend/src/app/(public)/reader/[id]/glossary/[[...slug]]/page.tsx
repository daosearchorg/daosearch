import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBook } from "@/lib/queries";
import { auth } from "@/auth";
import { slugify } from "@/lib/utils";
import { BookGlossary } from "@/components/reader/book-glossary";

interface Props {
  params: Promise<{ id: string; slug?: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(Number(id));
  if (!book) return { title: "Glossary" };
  const title = book.titleTranslated || book.title || "Untitled";
  return {
    title: `Glossary — ${title}`,
    description: `Entity glossary for ${title}`,
  };
}

export default async function GlossaryPage({ params }: Props) {
  const { id, slug } = await params;
  const bookId = Number(id);
  if (isNaN(bookId)) notFound();

  const book = await getBook(bookId);
  if (!book) notFound();

  const displayTitle = book.titleTranslated || book.title || "Untitled";
  const expectedSlug = slugify(displayTitle);
  if (expectedSlug && slug?.[0] !== expectedSlug) {
    redirect(`/reader/${bookId}/glossary/${expectedSlug}`);
  }

  const session = await auth();

  return (
    <BookGlossary
      bookId={bookId}
      bookTitle={displayTitle}
      isAuthenticated={!!session?.user?.dbId}
    />
  );
}
