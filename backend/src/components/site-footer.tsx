"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Rss } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { DiscordIcon } from "@/components/icons/provider-icons";

const LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: "/about", label: "About" },
  { href: "/guide", label: "Guide" },
  { href: "/stats", label: "Stats" },
  { href: "/api-docs", label: "API" },
  { href: "/discord", label: "Discord Bot" },
  { href: "https://chatgpt.com/g/g-69b1c31a6d00819196df8e07dc4591a9-daosearch", label: "ChatGPT", external: true },
  { href: "/api-docs#mcp-server", label: "Claude" },
  { href: "/changelog", label: "Changelog" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  const pathname = usePathname();

  return (
    <footer className="mt-auto pt-12">
      <Separator />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 sm:py-8 flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-3">
        <nav className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1">
          {LINKS.map(({ href, label, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className={`text-xs transition-colors ${
                  pathname === href
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            )
          )}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="https://discord.gg/Gmd3JXDuEU"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Discord"
          >
            <DiscordIcon className="size-4" />
          </a>
<a
            href="mailto:daosearch@gmail.com"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Email"
          >
            <Mail className="size-4" />
          </a>
          <a
            href="/rss/books"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="RSS Feed"
          >
            <Rss className="size-4" />
          </a>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} DaoSearch
          </p>
        </div>
      </div>
    </footer>
  );
}
