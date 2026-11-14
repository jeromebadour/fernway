import type { MetadataRoute } from "next";

// The public pages, the ones a visitor or a search engine should find. The console demos are read-only and
// labelled as invented; they stay out of the sitemap (and say noindex) so search shows the real pages first.
const PAGES = ["", "/pricing", "/trial", "/demo", "/contact", "/track", "/break-it", "/delivery", "/status", "/changelog",
  "/docs", "/docs/api", "/docs/webhooks", "/docs/wordpress", "/docs/laravel", "/about", "/privacy", "/terms", "/sign-up", "/sign-in"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "https://fernway.jeromebadour.com").replace(/\/$/, "");
  return PAGES.map((p) => ({ url: `${base}${p}`, changeFrequency: p === "/changelog" || p === "/status" ? "daily" : "weekly", priority: p === "" ? 1 : 0.6 }));
}
