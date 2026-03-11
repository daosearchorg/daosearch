import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserNotifications } from "@/lib/queries";
import { AccountNav } from "@/components/account-nav";
import { Pagination } from "@/components/pagination";
import { NotificationList } from "./notification-list";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificationsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { items, totalPages, unreadCount } = await getUserNotifications(session.user.dbId, page);

  return (
    <div className="mx-auto max-w-3xl">
      <AccountNav />
      <NotificationList items={items} unreadCount={unreadCount} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
