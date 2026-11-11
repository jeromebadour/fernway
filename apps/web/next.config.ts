import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container runs .next/standalone/apps/web/server.js: only the files the app needs.
  output: "standalone",
  // A monorepo: trace from its root so @fernway/core is included in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  poweredByHeader: false,
  // No page of Fernway's may be framed by another site (clickjacking), except its page made to live inside GHL, which
  // only GHL's own addresses may frame.
  async headers() {
    return [
      { source: "/((?!ghl/app$).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
      { source: "/ghl/app", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors https://app.gohighlevel.com https://*.gohighlevel.com https://*.leadconnectorhq.com" }] },
    ];
  },
};

export default nextConfig;
