import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container runs .next/standalone/apps/web/server.js: only the files the app needs.
  output: "standalone",
  // A monorepo: trace from its root so @fernway/core is included in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  poweredByHeader: false,
};

export default nextConfig;
