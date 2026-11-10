import { ingestLead, trackToken } from "@fernway/delivery";
import { z } from "zod";
import { delivery } from "@/lib/connect";
import { forgetTimes, stillFree } from "@/lib/booking";
import { intake, withinLimits } from "@/lib/intake";

export const dynamic = "force-dynamic";

// The public site's forms. Each form maps to one route on Fernway's own account; the lead then travels like any other.
const forms = { trial: "trial", contact: "contact", demo: "demo" } as const;

const body = z.object({
  form: z.enum(Object.keys(forms) as [keyof typeof forms]),
  // Made by the page when the form opens, so a double press or a resend of the same form is one lead.
  key: z.string().regex(/^[0-9a-f-]{36}$/),
  // A field people never see: a bot that fills it in is turned away without a lead being made.
  trap: z.string().max(0).optional().default(""),
  contact: z.record(z.string(), z.string().max(2000)),
  slot: z.string().max(40).optional(),
});

const answer = (status: number, json: object) => Response.json(json, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return answer(400, { ok: false, problems: ["the form could not be read; reload the page and send it again"] });
  }
  if (!parsed.success) return answer(400, { ok: false, problems: ["the form could not be read; reload the page and send it again"] });
  const { form, key, contact, slot } = parsed.data;

  const ip = request.headers.get("x-real-ip") ?? "unknown";
  const limit = await withinLimits(ip);
  if (!limit.ok) {
    return answer(429, {
      ok: false,
      problems: [limit.reason === "visitor"
        ? "that's the most this demo takes from one visitor in an hour; try again later"
        : "the demo has taken all the leads it takes today; try again tomorrow"],
    });
  }

  // A booking form: the picked time must still be free in GHL at this moment, or the visitor picks again.
  if (form === "demo") {
    if (!slot) return answer(422, { ok: false, problems: ["slot: a time for the meeting"] });
    const free = await stillFree("demo", slot);
    if (free === null) return answer(503, { ok: false, problems: ["the calendar can't be read right now; try again in a minute"] });
    if (!free) {
      await forgetTimes("demo");
      return answer(409, { ok: false, taken: true, problems: ["slot: that time was just taken; pick another"] });
    }
  }

  const { deps, accountId } = intake();
  // Only the fields this form has; empty ones are left out rather than sent as blanks.
  const filled = Object.fromEntries(Object.entries(contact).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ""));
  const r = await ingestLead(deps, accountId, { idempotencyKey: `site-${form}-${key}`, source: "form", route: forms[form], contact: filled, ...(form === "demo" ? { slot } : {}) });
  if (form === "demo" && r.ok && !r.duplicate) await forgetTimes("demo");
  if (!r.ok) {
    // A form whose route isn't set up is our mistake, not the visitor's: say so in plain words, log the real reason.
    if (r.problems.some((p) => p.startsWith("route:"))) {
      console.error(`site form ${form}: ${r.problems.join("; ")}`);
      return answer(503, { ok: false, problems: ["this form isn't open yet; try again later"] });
    }
    return answer(422, { ok: false, problems: r.problems });
  }
  return answer(r.duplicate ? 200 : 201, {
    ok: true,
    number: r.waybill.number,
    track: `/track/${trackToken(delivery().cfg.key, r.waybill.id)}`,
  });
}
