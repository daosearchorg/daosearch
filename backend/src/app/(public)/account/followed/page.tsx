import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFollowedLists, getFollowedQidianBooklists } from "@/lib/queries";
import { AccountNav } from "@/components/layout/account-nav";
import { Pagination } from "@/components/shared/pagination";
import { FollowedClient } from "./followed-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FollowedPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [communityResult, qidianResult] = await Promise.all([
    getFollowedLists(session.user.dbId, page),
    getFollowedQidianBooklists(session.user.dbId, page),
  ]);

  const totalPages = Math.max(communityResult.totalPages, qidianResult.totalPages);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <h1 className="text-2xl font-normal tracking-tight mb-4">Followed Booklists</h1>
      <FollowedClient
        initialLists={communityResult.items}
        initialQidianLists={qidianResult.items}
      />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
