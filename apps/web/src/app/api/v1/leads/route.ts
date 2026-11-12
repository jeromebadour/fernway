import { apiAccepted, ingestLead, trackToken, waybillPath } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, appUrl, caller, problem } from "@/lib/api";
import { intake } from "@/lib/intake";

export const dynamic = "force-dynamic";

// POST /api/v1/leads: a lead from a customer's own code. Checked by the engine, then queued for GHL like any other.
export async function POST(request: Request) {
  const who = await caller(request, "send");
  if ("refused" in who) return who.refused;

  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) return problem(400, "body: send the lead as JSON, with Content-Type: application/json");
  // The engine checks everything; this only stops a caller choosing their own source (an import tool may say import).
  if (!body || typeof body !== "object" || Array.isArray(body)) return problem(422, "body: a lead is a JSON object");
  const said = (body as { source?: unknown }).source;
  if (said !== undefined && said !== "import") return problem(422, "source: leave it out (Fernway sets api), or import from an import tool");
  const r = await ingestLead(intake().deps, who.accountId, { ...body, source: said === "import" ? "import" : "api" });
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
