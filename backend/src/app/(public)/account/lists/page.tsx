import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserLists } from "@/lib/queries";
import { AccountNav } from "@/components/account-nav";
import { Pagination } from "@/components/pagination";
import { ListsClient } from "./lists-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ListsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { items, totalPages } = await getUserLists(session.user.dbId, page);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <ListsClient initialLists={items} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
