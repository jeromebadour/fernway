import { ingestLead, receiveStripe } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { intake } from "@/lib/intake";

export const dynamic = "force-dynamic";

// An account's own Stripe calls here (Stripe payments in, Growth and up). Only a body signed with that account's secret,
// and recent, is read; a paid checkout becomes a lead on the account's chosen route. Answers say whether Stripe should
// try again: 5xx and 403 (a paused plan) yes, everything else no.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^stin_[A-Za-z0-9_-]{24}$/.test(token)) return new Response(null, { status: 404 });
  const raw = await request.text();
  if (raw.length > 512_000) return Response.json({ ok: false, result: "too large for a Stripe event" }, { status: 413 });
  try {
    const { db, cfg } = delivery();
    const a = await receiveStripe(
      { db, key: cfg.key, sendLead: (accountId, input) => ingestLead(intake().deps, accountId, input) },
      token, raw, request.headers.get("stripe-signature"),
    );
    return Response.json(a.body, { status: a.status });
  } catch (e) {
    console.error(`stripe in ${token.slice(0, 9)}: ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ ok: false, result: "not handled yet; Stripe will send it again" }, { status: 500 });
  }
}
