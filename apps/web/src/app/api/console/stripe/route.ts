import { linkStripe, unlinkStripe } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, manager, outcome } from "@/lib/console-api";

export const dynamic = "force-dynamic";

// Links the account's own Stripe (owners and admins, Growth and up): the signing secret of the Stripe webhook that points
// at the account's address, and the route paid checkouts take. A blank secret keeps the one kept. Audited.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const { db, cfg } = delivery();
  return outcome(await linkStripe(db, cfg.key, s.m, { secret: typeof s.body.secret === "string" ? s.body.secret : "", route: typeof s.body.route === "string" ? s.body.route : "" }));
}

// Unlinks it: Stripe's calls to the old address are refused from then on; leads already made stay. Audited.
export async function DELETE(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  return (await unlinkStripe(delivery().db, s.m)) ? answer(200, { ok: true }) : answer(403, { ok: false, problems: ["only the owner or an admin may unlink Stripe"] });
}
