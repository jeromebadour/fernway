import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container runs .next/standalone/apps/web/server.js: only the files the app needs.
  output: "standalone",
  // A monorepo: trace from its root so @fernway/core is included in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  poweredByHeader: false,
  // No page of Fernway's may be framed by another site (clickjacking), except its panel made to live inside GHL. GHL is
  // also reached on agencies' own white-label domains, so any https site may frame the panel: it shows nothing and can
  // do nothing without GHL's sealed note about who is looking. Embed forms (/f/<key>) are framed by the sites their owner
  // listed: that header is set per form in src/proxy.ts.
  async headers() {
    return [
      { source: "/((?!panel$|f/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
      { source: "/panel", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors https:" }] },
      { source: "/embed.js", headers: [{ key: "Cache-Control", value: "public, max-age=300" }] },
    ];
  },
};

export default nextConfig;
