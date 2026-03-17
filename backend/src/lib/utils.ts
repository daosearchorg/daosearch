import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function bookUrl(id: number, title: string | null): string {
  const slug = title ? slugify(title) : null;
  return slug ? `/book/${id}/${slug}` : `/book/${id}`;
}

export function readerUrl(id: number, title: string | null): string {
  const slug = title ? slugify(title) : null;
  return slug ? `/reader/${id}/${slug}` : `/reader/${id}`;
}

export function booklistUrl(id: number, title: string | null): string {
  const slug = title ? slugify(title) : null;
  return slug ? `/qidian/booklists/${id}/${slug}` : `/qidian/booklists/${id}`;
}

export function communityBooklistUrl(id: number, name: string | null): string {
  const slug = name ? slugify(name) : null;
  return slug ? `/daosearch/booklists/${id}/${slug}` : `/daosearch/booklists/${id}`;
}

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
