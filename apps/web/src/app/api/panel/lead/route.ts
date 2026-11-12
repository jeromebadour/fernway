import { leadView, scoreOf, trackToken } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { appWho, json } from "@/lib/ghl-app";

export const dynamic = "force-dynamic";

// One lead's waybill for the page inside GHL, in the ticket's own account only (another account's lead is a 404).
export async function GET(request: Request) {
  const who = appWho(request);
  if (!who) return json(401, { ok: false });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const v = Number.isInteger(id) && id > 0 ? await leadView(delivery().db, who.accountId, id) : null;
  if (!v) return json(404, { ok: false });
  const score = await scoreOf(delivery().db, who.accountId, v.shipmentId);
  return json(200, { ok: true, lead: v, score, receipt: `/track/${trackToken(delivery().cfg.key, v.shipmentId)}` });
}
