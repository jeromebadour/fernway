import { readTrackToken, resend, shipments } from "@fernway/delivery";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { delivery } from "@/lib/connect";
import { demoAccount, intake } from "@/lib/intake";

export const dynamic = "force-dynamic";

// "Resend": the held Break it lead goes again, a fresh set of tries, with the resend on its receipt. Only a Break it
// lead, and only through its own receipt link.
export async function POST(request: Request) {
  const parsed = z.object({ track: z.string().max(400) }).safeParse(await request.json().catch(() => null));
  const id = parsed.success ? readTrackToken(delivery().cfg.key, parsed.data.track) : null;
  const { deps } = intake();
  const [s] = id === null ? [] : await deps.db.select({ accountId: shipments.accountId }).from(shipments).where(eq(shipments.id, id));
  if (!s || s.accountId !== demoAccount()) return Response.json({ ok: false }, { status: 404 });
  const ok = await resend(deps, id!, "resent from Break it, as if the phone number were fixed");
  return Response.json({ ok }, { status: ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
