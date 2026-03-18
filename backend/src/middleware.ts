import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";

const RATE_LIMITS: { pattern: string; maxRequests: number; windowMs: number }[] = [
  { pattern: "/api/v1/", maxRequests: 30, windowMs: 60_000 },
  { pattern: "/api/books/search", maxRequests: 30, windowMs: 60_000 },
  { pattern: "/api/account/avatar", maxRequests: 10, windowMs: 300_000 },
  { pattern: "/api/", maxRequests: 120, windowMs: 60_000 },
];

function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Apply rate limiting to API routes
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(req.headers);
    const rule = RATE_LIMITS.find((r) => pathname.startsWith(r.pattern));
    if (rule && isRateLimited(ip, rule.pattern, rule.maxRequests, rule.windowMs)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files and API routes that don't need auth
    "/((?!_next/static|_next/image|favicon.ico|api/health|rankings|stats).*)",
  ],
};
