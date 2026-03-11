import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ThemeColor } from "@/components/theme-color";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://daosearch.io"),
  title: {
    default: "DaoSearch",
    template: "%s | DaoSearch",
  },
  description: "Opensource Jade Slip for Raws — discover, rank, and track web novels from Qidian. Browse rankings, booklists, translated comments, and community reviews.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "DaoSearch",
    locale: "en_US",
    images: [{ url: "https://bucket.daosearch.io/logo.webp", width: 1024, height: 1536 }],
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/rss/books", title: "DaoSearch — New Books" },
        { url: "/rss/qidian", title: "DaoSearch — Qidian Comments" },
        { url: "/rss/community", title: "DaoSearch — Community Activity" },
      ],
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-background">
      <body
        className={`${inter.variable} antialiased flex min-h-dvh flex-col overflow-x-hidden`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ThemeColor />
          <NextTopLoader color="var(--foreground)" height={2} showSpinner={false} shadow={false} />
          <SessionProvider>
            <SiteNav />
            {children}
            <SiteFooter />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
