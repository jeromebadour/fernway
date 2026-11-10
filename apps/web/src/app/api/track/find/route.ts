import { findWaybill, trackToken } from "@fernway/delivery";
import { z } from "zod";
import { delivery } from "@/lib/connect";
import { intake, lookupAllowed } from "@/lib/intake";

export const dynamic = "force-dynamic";

const body = z.object({ number: z.string().max(40), email: z.string().max(200) });
const answer = (status: number, json: object) => Response.json(json, { status, headers: { "Cache-Control": "no-store" } });

// Finds a lead again from its waybill number and the email it was sent with, and hands back its receipt link.
// The same "not found" whether the number exists or not, so the answer gives nothing away.
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return answer(400, { ok: false, problem: "Put in the waybill number and your email." });
  if (!(await lookupAllowed(request.headers.get("x-real-ip") ?? "unknown"))) {
    return answer(429, { ok: false, problem: "That's the most lookups this page takes from one visitor in an hour. Try again later." });
  }
  const { accountId } = intake();
  const { db, cfg } = delivery();
  const id = await findWaybill(db, accountId, parsed.data.number, parsed.data.email);
  if (id === null) return answer(404, { ok: false, problem: "No waybill with that number and email. Check both against your receipt." });
  return answer(200, { ok: true, track: `/track/${trackToken(cfg.key, id)}` });
}
