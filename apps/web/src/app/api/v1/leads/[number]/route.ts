import { apiLead, shipmentByNumber, trackView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, caller, problem } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/v1/leads/FW-26-00817: where a lead is, with every scan. Only the key's own account's leads.
export async function GET(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const who = await caller(request, "read");
  if ("refused" in who) return who.refused;
  const { db } = delivery();
  const id = await shipmentByNumber(db, who.accountId, decodeURIComponent((await params).number));
  const view = id === null ? null : await trackView(db, id);
  if (!view) return problem(404, "number: no lead with that waybill number on this key's account");
  // The consignee stays out: the caller sent those details and has them; the API answers where the lead is.
  const { number, state, pickedUpAt, route, holdReason, meeting, scans } = view;
  return answer(200, apiLead.parse({ ok: true, lead: { number, state, pickedUpAt, route, holdReason, meeting, scans } }));
}
