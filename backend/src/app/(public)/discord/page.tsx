import type { Metadata } from "next";
import { DiscordIcon } from "@/components/icons/provider-icons";

export const metadata: Metadata = {
  title: "Discord Bot",
  description: "Add the DaoSearch Discord bot to your server — search books, browse rankings, get recommendations, and more with slash commands.",
  alternates: { canonical: "/discord" },
  openGraph: {
    title: "Discord Bot",
    description: "Add the DaoSearch Discord bot to your server — search books, browse rankings, and more.",
  },
};

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1417613009249112216&permissions=0&integration_type=0&scope=bot";

const commands = [
  {
    name: "/book",
    args: "<name or id>",
    description: "Look up a book by name or ID — shows synopsis, stats, scores, and links",
  },
  {
    name: "/browse",
    args: "[genre] [sort] [query]",
    description: "Browse the library with optional genre, sort, and title filters",
  },
  {
    name: "/similar",
    args: "<name or id>",
    description: "Get book recommendations based on a specific book",
  },
  {
    name: "/reviews",
    args: "<name or id>",
    description: "Read community reviews and Qidian comments for a book",
  },
  {
    name: "/rankings",
    args: "[gender] [type] [cycle]",
    description: "View Qidian rankings — trending, rising, free, finished, all-time, and more",
  },
  {
    name: "/trending",
    args: "[period] [genre]",
    description: "Community rankings — what readers are actually reading right now",
  },
  {
    name: "/genres",
    args: "",
    description: "List all available genres with links to the library",
  },
  {
    name: "/booklists",
    args: "[sort]",
    description: "Browse Qidian-curated booklists — popular, recent, or largest",
  },
  {
    name: "/stats",
    args: "",
    description: "View database statistics — total books, chapters, comments, and more",
  },
];

export default function DiscordBotPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Discord Bot</h1>
        <p className="text-sm sm:text-base text-muted-foreground text-center max-w-lg">
          Search books, browse rankings, and get recommendations — all from Discord
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Add to your server</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          The DaoSearch bot brings the full database to your Discord server with slash commands.
          No permissions needed — it only responds to commands and sends embeds.
        </p>
        <div className="flex justify-center">
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752C4] transition-colors"
          >
            <DiscordIcon className="size-4" />
            Add to Discord
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Commands</h2>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm sm:text-base">
            <thead>
              <tr className="border-b text-xs sm:text-sm text-muted-foreground">
                <th className="text-left font-medium px-4 sm:px-5 py-3">Command</th>
                <th className="text-left font-medium px-4 sm:px-5 py-3 hidden sm:table-cell">Description</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((cmd) => (
                <tr key={cmd.name} className="border-b last:border-0">
                  <td className="px-4 sm:px-5 py-3 align-top">
                    <code className="text-xs sm:text-sm">
                      {cmd.name}
                      {cmd.args && <span className="text-muted-foreground"> {cmd.args}</span>}
                    </code>
                    <p className="text-xs text-muted-foreground mt-1 sm:hidden">{cmd.description}</p>
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-muted-foreground hidden sm:table-cell">
                    {cmd.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Features</h2>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li>Search by book name or ID — no need to remember numeric IDs</li>
          <li>Rich embeds with cover art, stats, scores, and direct links</li>
          <li>Button pagination for browsing through rankings, booklists, and search results</li>
          <li>Genre dropdowns with all primary genres as choices</li>
          <li>Google search links for finding raws by their original title</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Community</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Join our Discord server to chat about books, get help, or suggest features for the bot.
        </p>
        <div className="flex justify-center">
          <a
            href="https://discord.gg/Gmd3JXDuEU"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <DiscordIcon className="size-4" />
            Join our Discord
          </a>
        </div>
      </section>
    </div>
  );
}
