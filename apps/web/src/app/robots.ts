import type { MetadataRoute } from "next";

// What search engines may read: the public site. Everything behind a sign-in, every personal link (receipts,
// confirm, reset, join), the GHL panel, embed frames and the API stay out; those pages also say noindex themselves.
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "https://fernway.jeromebadour.com").replace(/\/$/, "");
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/console", "/account", "/operator", "/panel", "/f/", "/connected", "/confirm/", "/reset/", "/join/", "/track/"],
    }],
    sitemap: `${base}/sitemap.xml`,
  };
}
