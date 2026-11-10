import { confirmTwoStep } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Turns two-step on with the app's first code; the recovery codes come back once.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (!(await within(`two-step-on:${s.p.userId}`, 10))) return answer(429, { ok: false, problems: ["code: too many tries this hour; wait, then start again"] });
  const { db, cfg } = delivery();
  const r = await confirmTwoStep(db, cfg.key, s.p.userId, s.p.sessionId, String(s.body.code ?? ""));
  return r.ok ? answer(200, r) : answer(422, r);
}
