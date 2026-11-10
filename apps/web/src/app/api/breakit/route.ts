import { breakItKey, failures, ingestLead, trackToken } from "@fernway/delivery";
import { z } from "zod";
import { delivery } from "@/lib/connect";
import { breakItAllowed, demoAccount, intake } from "@/lib/intake";

export const dynamic = "force-dynamic";

// Starts a Break it run: an invented lead (nothing about the visitor) on the demo account, with the failure picked.
// The same key sent again is the same lead: that is the "Sent twice" failure, shown with the real idempotency check.
const body = z.object({
  failure: z.enum(failures.map((f) => f.key) as [string, ...string[]]),
  key: z.string().regex(/^[0-9a-f-]{36}$/),
});
const answer = (status: number, json: object) => Response.json(json, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return answer(400, { ok: false, problem: "Pick what GHL should do, then send." });
  if (!(await breakItAllowed(request.headers.get("x-real-ip") ?? "unknown"))) {
    return answer(429, { ok: false, problem: "That's 10 runs this hour. Fernway would wait and try again; so can you, in an hour." });
  }
  const { deps } = intake();
  const short = parsed.data.key.slice(0, 8);
  const r = await ingestLead(deps, demoAccount(), {
    idempotencyKey: breakItKey(parsed.data.failure as never, parsed.data.key),
    source: "demo",
    route: "breakit",
    contact: { firstName: "Break it", lastName: "visitor", email: `visitor-${short}@breakit.example`, companyName: "Invented for the demo" },
  });
  if (!r.ok) {
    console.error(`break it: ${r.problems.join("; ")}`);
    return answer(503, { ok: false, problem: "The demo isn't open yet. Try again later." });
  }
  return answer(r.duplicate ? 200 : 201, {
    ok: true, number: r.waybill.number, duplicate: r.duplicate, track: trackToken(delivery().cfg.key, r.waybill.id),
  });
}
