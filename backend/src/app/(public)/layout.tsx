export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="mx-auto max-w-6xl px-5 sm:px-6 py-6 w-full min-w-0">{children}</main>;
}
