import { handleEvent, readEvent } from "@fernway/delivery";
import { billingDeps, billingOn, stripe } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Stripe's webhook. Only a body signed with Fernway's webhook secret, and recent, is read. An event that could not be
// handled answers 500, so Stripe sends it again later; a repeat of one already handled answers 200 and does nothing.
export async function POST(request: Request) {
  if (!billingOn()) return new Response(null, { status: 404 });
  const raw = await request.text();
  const event = readEvent(stripe(), raw, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET!);
  if (!event) return Response.json({ ok: false, problem: "signature: not Stripe's, or too old" }, { status: 400 });
  try {
    const handled = await handleEvent(billingDeps(), event);
    return Response.json({ ok: true, handled });
  } catch (e) {
    console.error(`stripe webhook ${event.id} ${event.type}: ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ ok: false, problem: "not handled yet; Stripe will send it again" }, { status: 500 });
  }
}
