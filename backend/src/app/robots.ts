import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/v1/", "/api/mcp"],
        disallow: ["/account/", "/api/"],
      },
    ],
    sitemap: "https://daosearch.io/sitemap.xml",
  };
}
