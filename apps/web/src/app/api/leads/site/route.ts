import { ingestLead, trackToken } from "@fernway/delivery";
import { z } from "zod";
import { delivery } from "@/lib/connect";
import { intake, withinLimits } from "@/lib/intake";

export const dynamic = "force-dynamic";

// The public site's forms. Each form maps to one route on Fernway's own account; the lead then travels like any other.
const forms = { trial: "trial" } as const;

const body = z.object({
  form: z.enum(Object.keys(forms) as [keyof typeof forms]),
  // Made by the page when the form opens, so a double press or a resend of the same form is one lead.
  key: z.string().regex(/^[0-9a-f-]{36}$/),
  // A field people never see: a bot that fills it in is turned away without a lead being made.
  trap: z.string().max(0).optional().default(""),
  contact: z.record(z.string(), z.string().max(2000)),
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
  const { form, key, contact } = parsed.data;

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

  const { deps, accountId } = intake();
  // Only the fields this form has; empty ones are left out rather than sent as blanks.
  const filled = Object.fromEntries(Object.entries(contact).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ""));
  const r = await ingestLead(deps, accountId, { idempotencyKey: `site-${form}-${key}`, source: "form", route: forms[form], contact: filled });
  if (!r.ok) return answer(422, { ok: false, problems: r.problems });
  return answer(r.duplicate ? 200 : 201, {
    ok: true,
    number: r.waybill.number,
    track: `/track/${trackToken(delivery().cfg.key, r.waybill.id)}`,
  });
}
