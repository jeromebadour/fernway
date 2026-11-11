import { audit, revokeKey } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (s.p.role === "member") return new Response(null, { status: 404 });
  const { db } = delivery();
  const prefix = String(s.body.prefix ?? "");
  const ok = await revokeKey(db, s.p.accountId, prefix);
  if (ok) await audit(db, { accountId: s.p.accountId, userId: s.p.userId, name: s.p.name }, "key.revoked", { kind: "key", id: `fw_${prefix.slice(0, 20)}_` });
  return ok ? answer(200, { ok: true, revokedAt: new Date().toISOString() }) : answer(404, { ok: false, problems: ["form: that key was already revoked"] });
}
