"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, Mail, Rss } from "lucide-react";
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
      <div className="mx-auto max-w-6xl px-5 sm:px-6 py-6 sm:py-8 flex flex-col gap-5">
        <nav className="grid grid-cols-3 gap-x-6 gap-y-2.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-5 sm:gap-y-2">
          {LINKS.map(({ href, label, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] sm:text-[13px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className={`text-[13px] sm:text-[13px] transition-colors ${
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
        <div className="flex items-center justify-end sm:justify-center gap-4">
          <a
            href="https://github.com/daosearchorg/daosearch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <Github className="size-4" />
          </a>
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
          <span className="text-xs text-muted-foreground/60 ml-1">
            &copy; {new Date().getFullYear()} DaoSearch
          </span>
        </div>
      </div>
    </footer>
  );
}
