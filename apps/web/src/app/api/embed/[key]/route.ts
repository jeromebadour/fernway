import { embedLead, formByKey, trackToken } from "@fernway/delivery";
import { z } from "zod";
import { ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { intake } from "@/lib/intake";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

const body = z.object({
  // Made when the form opens, so a double press or a resend of the same form is one lead.
  opened: z.string().regex(/^[0-9a-f-]{36}$/),
  // A field people never see: a bot that fills it in is turned away without a lead being made.
  trap: z.string().max(0).optional().default(""),
  contact: z.record(z.string(), z.string().max(2000)),
});
const answer = (status: number, json: object) => Response.json(json, { status, headers: { "Cache-Control": "no-store" } });

// Takes a lead from an embed form. The key is public (it sits in the page's code), so what it can do is narrow: send
// a lead to its own route, 10 from one visitor an hour and 300 an hour for the whole form.
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const form = await formByKey(delivery().db, key);
  if (!form) return answer(404, { ok: false, problems: ["this form is closed"] });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return answer(400, { ok: false, problems: ["the form could not be read; reload the page and send it again"] });
  if (!(await within(`embed:${form.id}:${ip(request)}`, 10))) return answer(429, { ok: false, problems: ["that's the most this form takes from one visitor in an hour; try again later"] });
  if (!(await within(`embed-all:${form.id}`, 300))) return answer(429, { ok: false, problems: ["this form has taken all it takes this hour; try again later"] });

  const r = await embedLead(intake().deps, form, parsed.data.opened, parsed.data.contact);
  if (!r.ok) {
    // A form whose route has gone is the owner's to fix, not the visitor's: plain words for them, the reason in the log.
    if (r.problems.some((p) => p.startsWith("route:"))) {
      console.error(`embed form ${form.id}: ${r.problems.join("; ")}`);
      return answer(503, { ok: false, problems: ["this form isn't taking leads right now; try again later"] });
    }
    return answer(422, { ok: false, problems: r.problems });
  }
  return answer(r.duplicate ? 200 : 201, { ok: true, number: r.waybill.number, track: `/track/${trackToken(delivery().cfg.key, r.waybill.id)}` });
}
