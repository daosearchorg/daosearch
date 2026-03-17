import { notFound, redirect } from "next/navigation";
import { getBook } from "@/lib/queries";
import { auth } from "@/auth";
import { slugify } from "@/lib/utils";
import { DaoReaderExtension } from "@/components/reader/extension";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ReaderLegacyPage({ searchParams }: Props) {
  const params = await searchParams;

  // Extension mode: ?ext=1 (with or without url)
  if (params.ext === "1") {
    const session = await auth();
    return (
      <DaoReaderExtension
        sourceUrl={params.url || null}
        isAuthenticated={!!session?.user?.dbId}
      />
    );
  }

  // Legacy ?book={id} — redirect to /reader/{id}/{slug}
  const bookId = Number(params.book);
  if (!bookId || isNaN(bookId)) notFound();

  const book = await getBook(bookId);
  if (!book) notFound();

  const title = book.titleTranslated || book.title || "Untitled";
  const slug = slugify(title);
  redirect(`/reader/${bookId}${slug ? `/${slug}` : ""}`);
}
