import { newRecoveryCodes } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (!(await within(`password:${s.p.userId}`, 10))) return answer(429, { ok: false, problems: ["password: too many tries this hour; wait, then try again"] });
  const r = await newRecoveryCodes(delivery().db, s.p.userId, String(s.body.password ?? ""));
  return r.ok ? answer(200, r) : answer(422, r);
}
