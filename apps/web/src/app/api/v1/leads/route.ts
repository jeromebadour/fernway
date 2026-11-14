import { apiAccepted, ingestLead, shipments, trackToken, waybillPath } from "@fernway/delivery";
import { and, eq } from "drizzle-orm";
import { delivery } from "@/lib/connect";
import { answer, appUrl, caller, problem } from "@/lib/api";
import { forgetTimes, routeKind, stillFree } from "@/lib/booking";
import { intake } from "@/lib/intake";

export const dynamic = "force-dynamic";

// The sources a caller may name: Fernway's own tools. Anything else is Fernway's to set (api).
const TOOL_SOURCES = new Set(["import", "wordpress", "laravel"]);

// POST /api/v1/leads: a lead from a customer's own code. Checked by the engine, then queued for GHL like any other.
export async function POST(request: Request) {
  const who = await caller(request, "send");
  if ("refused" in who) return who.refused;

  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) return problem(400, "body: send the lead as JSON, with Content-Type: application/json");
  // The engine checks everything; this only stops a caller choosing just any source. Fernway's own tools name themselves
  // (the import tool, the WordPress plugin, the Laravel package), so receipts and the console say where a lead came from.
  if (!body || typeof body !== "object" || Array.isArray(body)) return problem(422, "body: a lead is a JSON object");
  const said = (body as { source?: unknown }).source;
  if (said !== undefined && !(typeof said === "string" && TOOL_SOURCES.has(said))) {
    return problem(422, "source: leave it out (Fernway sets api), or import, wordpress or laravel from those tools");
  }
  // A booking: the time must still be free in GHL right now, or nothing is made (the same check the site's own forms make).
  // A retry with the same idempotencyKey skips it: its time is taken by its own first send, and it gets that waybill back.
  const { route, slot, idempotencyKey } = body as { route?: unknown; slot?: unknown; idempotencyKey?: unknown };
  const seen = typeof idempotencyKey === "string" && (await intake().deps.db.select({ id: shipments.id }).from(shipments)
    .where(and(eq(shipments.accountId, who.accountId), eq(shipments.idempotencyKey, idempotencyKey.trim()))).limit(1)).length > 0;
  const booking = !seen && typeof route === "string" && typeof slot === "string" && (await routeKind(route, who.accountId)) === "booking";
  if (booking) {
    const free = await stillFree(route as string, slot as string, who.accountId);
    if (free === null) return problem(503, "slot: GHL couldn't be reached to check the time; try again shortly");
    if (!free) {
      await forgetTimes(route as string, who.accountId);
      return problem(409, "slot: that time was just taken; read the route's slots again and pick another");
    }
  }
  const r = await ingestLead(intake().deps, who.accountId, { ...body, source: typeof said === "string" ? (said as "import" | "wordpress" | "laravel") : "api" });
  if (booking && r.ok && !r.duplicate) await forgetTimes(route as string, who.accountId);
  if (!r.ok) return problem(422, ...r.problems);

  const number = r.waybill.number;
  return answer(r.duplicate ? 200 : 201, apiAccepted.parse({
    ok: true,
    duplicate: r.duplicate,
    number,
    state: r.waybill.state,
    links: {
      self: `/api/v1/leads/${waybillPath(number)}`,
      receipt: `${appUrl()}/track/${trackToken(delivery().cfg.key, r.waybill.id)}`,
    },
  }));
}
