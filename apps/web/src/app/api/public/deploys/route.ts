import { deploys } from "@fernway/delivery";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// The days each site was deployed, for jeromebadour.com's service board (Freelance Website, 2026-11-14). Public and
// read-only: only what /changelog already shows (a day and the live commit), no cookies, no sign-in.
//
// Deploys are recorded in ops_runs from 2026-11-10 15:27 UTC (the Status deploy) on. The only deploy day before that
// was 2026-11-09 UTC (d040b26, first live at 20:51, and c8bee55 at 21:21; GHL-BUILD.md), kept here as fixed history.
// Alder & Pike's theme and plugin are mounted from Fernway's checkout, so a Fernway deploy deploys it too; it was
// first live 2026-11-13 22:10 UTC.
const SITES = {
  fernway: { liveSince: "2026-11-09", before: ["2026-11-09"] },
  alderpike: { liveSince: "2026-11-13", before: [] as string[] },
} as const;

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("site") ?? "fernway";
  const site = SITES[key as keyof typeof SITES];
  if (!site) return Response.json({ error: "site: fernway or alderpike" }, { status: 404 });
  const rows = await deploys(delivery().db);
  const days = new Set<string>(site.before);
  for (const r of rows) days.add(r.at.slice(0, 10));
  const list = [...days].filter((d) => d >= site.liveSince).sort();
  const commit = (process.env.APP_COMMIT ?? rows[0]?.commit ?? "dev").slice(0, 7);
  return Response.json(
    { live_since: site.liveSince, deploys: list, commit },
    { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
  );
}
