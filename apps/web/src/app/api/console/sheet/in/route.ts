import { setSheetIn } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, manager, outcome } from "@/lib/console-api";
import { sheetsClient } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Turns "Leads in" on (a route without a meeting time) or off (route null). Owners and admins; audited.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const route = s.body.route;
  if (route !== null && typeof route !== "string") return answer(422, { ok: false, problems: ["route: a route's key, or null for off"] });
  return outcome(await setSheetIn(delivery().db, sheetsClient(), s.m, route));
}
