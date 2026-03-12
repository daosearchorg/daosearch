import type { Metadata } from "next";
import { Github, Mail } from "lucide-react";
import { DiscordIcon } from "@/components/icons/provider-icons";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about DaoSearch — your gateway to discovering web novel raws from Qidian.",
};

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">About</h1>
        <p className="text-sm sm:text-base text-muted-foreground text-center max-w-lg">
          The Library Pavilion for Raws — discover and track web novel raws
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">What is DaoSearch?</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          DaoSearch is a community platform for discovering and tracking web novel raws from Qidian.
          We&apos;re not a reading site — think of us as the place you go to find what to read next,
          keep track of what you&apos;re reading, and see what the community is into.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Features</h2>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li>Library with search and filters — genre, author, chapter count, update date, and more</li>
          <li>Qidian rankings — trending, rising, free, finished, and all-time charts by gender</li>
          <li>Community rankings based on what readers are actually reading</li>
          <li>Booklists — both Qidian-curated and community-created</li>
          <li>Activity feeds showing what&apos;s happening across the community</li>
          <li>Ratings, reviews, and discussions on every novel</li>
          <li>Reading progress tracking — currently reading, plan to read, dropped, completed</li>
          <li>Community tagging on novels and booklists</li>
          <li>&ldquo;If you liked X, try Y&rdquo; recommendations</li>
          <li>Translated metadata — titles, synopses, and comments in English via Google Translate</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Community-driven</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          DaoSearch is built for the raws community. The data is sourced, but the curation comes
          from you — your ratings, reviews, tags, and booklists shape what others discover.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Open platform</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          DaoSearch is fully open-source. We provide a public API and an MCP server for AI agents — both
          fully documented and free to use. A Discord bot is also available to bring search, rankings,
          and book info directly into your server.
        </p>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li><a href="/api-docs" className="underline underline-offset-2 hover:text-foreground">Public API</a> — read-only REST API with search, rankings, booklists, and more</li>
          <li><a href="/api-docs#mcp-server" className="underline underline-offset-2 hover:text-foreground">MCP Server</a> — Model Context Protocol server for Claude and other AI agents</li>
          <li><a href="https://chatgpt.com/g/g-69b1c31a6d00819196df8e07dc4591a9-daosearch" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">ChatGPT</a> — custom GPT powered by our API</li>
          <li><a href="/discord" className="underline underline-offset-2 hover:text-foreground">Discord Bot</a> — slash commands for search, rankings, reviews, and recommendations</li>
          <li><a href="https://github.com/daosearchorg/daosearch" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">GitHub</a> — full source code, contributions welcome</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Get in touch</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Discord is the best way to reach us — for feedback, bug reports, feature requests, or
          just chatting about novels. We&apos;re active there daily.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="https://discord.gg/Gmd3JXDuEU"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm sm:text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            <DiscordIcon className="size-4" />
            Join our Discord
          </a>
          <a
            href="https://github.com/daosearchorg/daosearch"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm sm:text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="size-4" />
            GitHub
          </a>
          <a
            href="mailto:daosearch@gmail.com"
            className="inline-flex items-center gap-2 text-sm sm:text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="size-4" />
            daosearch@gmail.com
          </a>
        </div>
      </section>
    </div>
  );
}
