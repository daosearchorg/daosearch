import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: "standalone",
  images: {
    unoptimized: true,
  },
  compress: false, // Let Cloudflare handle compression
  async headers() {
    return [
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/api/mcp",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version" },
          { key: "Access-Control-Expose-Headers", value: "Mcp-Session-Id" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://bucket.daosearch.io https://*.qidiantu.com https://cdn.discordapp.com https://lh3.googleusercontent.com http://*.myqcloud.com https://*.myqcloud.com https://www.google.com https://*.gstatic.com; font-src 'self'; connect-src 'self' https://translate.googleapis.com; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
