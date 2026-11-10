import { ghlSide, recordView } from "@fernway/delivery";
import { accountsOn } from "@/lib/accounts-on";
import { delivery } from "@/lib/connect";
import { intake } from "@/lib/intake";
import { currentPerson } from "@/lib/session";

export const dynamic = "force-dynamic";

// Your record as a file: Fernway's side and GHL's side, exactly as the page shows them.
export async function GET() {
  if (!accountsOn()) return new Response(null, { status: 404 });
  const p = await currentPerson();
  if (!p) return new Response(null, { status: 401 });
  const { deps, accountId: site } = intake();
  const fernway = await recordView(delivery().db, p.userId, p.accountId, site);
  const ghl = await ghlSide(deps, site, (fernway?.leads ?? []).map((l) => l.contactId).filter((c): c is string => !!c));
  const file = { exportedAt: new Date().toISOString(), heldByFernway: fernway, heldByGhl: ghl.reached ? ghl.contacts : "GHL could not be reached at the time of this export" };
  return new Response(JSON.stringify(file, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="fernway-record-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
