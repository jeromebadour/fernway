import { resetPassword } from "@fernway/delivery";
import { answer, gate } from "@/lib/account-api";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const r = await resetPassword(delivery().db, String(g.body.token ?? ""), String(g.body.password ?? ""));
  return r.ok ? answer(200, { ok: true, next: "/sign-in?done=password-changed" }) : answer(422, r);
}
