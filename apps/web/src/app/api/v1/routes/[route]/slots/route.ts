import { apiSlots } from "@fernway/delivery";
import { answer, caller, problem } from "@/lib/api";
import { freeTimes, routeKind, SLOT_WINDOW_DAYS } from "@/lib/booking";

export const dynamic = "force-dynamic";

const NOTICE_MS = 2 * 3_600_000;

// GET /api/v1/routes/{route}/slots: the free start times in the GHL calendar a booking route names, so a customer's own
// form (the WordPress plugin, a Laravel app) can offer real times. The lead's slot is checked again when it arrives.
export async function GET(request: Request, ctx: { params: Promise<{ route: string }> }) {
  const who = await caller(request, "read");
  if ("refused" in who) return who.refused;
  const { route } = await ctx.params;
  if (!/^[a-z0-9-]{1,40}$/.test(route)) return problem(404, `route: no route called ${route.slice(0, 40)} on this account`);

  const kind = await routeKind(route, who.accountId);
  if (kind === "none") return problem(404, `route: no route called ${route} on this account`);
  if (kind === "plain") return problem(422, `route: ${route} books no meetings (it names no calendar)`);

  const r = await freeTimes(route, who.accountId);
  if (!r.ok) return problem(503, "slots: GHL couldn't be reached for the calendar; try again shortly");
  const from = new Date(Date.now() + NOTICE_MS);
  return answer(200, apiSlots.parse({
    ok: true, route,
    from: from.toISOString(),
    to: new Date(from.getTime() + SLOT_WINDOW_DAYS * 86_400_000).toISOString(),
    slots: r.slots,
  }));
}
