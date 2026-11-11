import { GHL_WEBHOOK_KEY, handleGhlEvent, verifyGhl } from "@fernway/delivery";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// GHL's webhooks for the Fernway app. Only GHL's own Ed25519 signature over the exact body passes (X-GHL-Signature;
// GHL stopped the older RSA header on 1 September 2026). Answered at once; the same event twice changes nothing.
// FERNWAY_GHL_WEBHOOK_KEY replaces GHL's key only where a stand-in GHL signs (CI); the box never sets it.
const key = () => process.env.FERNWAY_GHL_WEBHOOK_KEY?.replace(/\\n/g, "\n") || GHL_WEBHOOK_KEY;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 64_000) return new Response(null, { status: 413 });
  if (!verifyGhl(raw, request.headers.get("x-ghl-signature"), key())) return Response.json({ ok: false }, { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ ok: false }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false }, { status: 400 });
  const r = await handleGhlEvent(delivery().db, raw, body as Record<string, unknown>);
  return Response.json({ ok: true, result: r.result, leads: r.leads });
}
