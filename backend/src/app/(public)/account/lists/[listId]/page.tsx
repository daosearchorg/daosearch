import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { booklistTags } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getListDetail, getBooklistTags } from "@/lib/queries";
import { AccountNav } from "@/components/account-nav";
import { Pagination } from "@/components/pagination";
import { BookSortSelect } from "@/components/book-sort-select";
import { getBookSort } from "@/lib/types";
import { ListDetailClient } from "./list-detail-client";
import { ListDetailHeader } from "./list-detail-header";

interface Props {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ListDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const { listId } = await params;
  const id = Number(listId);
  if (isNaN(id)) notFound();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = getBookSort(sp);

  const [result, listTags, userTagRows] = await Promise.all([
    getListDetail(id, session.user.dbId, page, sort),
    getBooklistTags(id),
    db
      .select({ tagId: booklistTags.tagId })
      .from(booklistTags)
      .where(and(eq(booklistTags.listId, id), eq(booklistTags.userId, session.user.dbId))),
  ]);
  if (!result) notFound();

  const { list, items, total, totalPages } = result;
  const userTagIds = userTagRows.map((r) => r.tagId);
  const tagsWithVotes = listTags.map((t) => ({
    ...t,
    userVoted: userTagIds.includes(t.id),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <ListDetailHeader list={list} total={total} sort={sort} listTags={tagsWithVotes} />

      <ListDetailClient listId={id} initialItems={items} sort={sort} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
