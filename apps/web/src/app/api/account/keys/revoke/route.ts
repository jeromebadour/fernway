import { revokeKey } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (s.p.role === "member") return new Response(null, { status: 404 });
  const ok = await revokeKey(delivery().db, s.p.accountId, String(s.body.prefix ?? ""));
  return ok ? answer(200, { ok: true, revokedAt: new Date().toISOString() }) : answer(404, { ok: false, problems: ["form: that key was already revoked"] });
}
