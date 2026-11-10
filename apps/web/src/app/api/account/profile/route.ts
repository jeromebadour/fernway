import { updateProfile } from "@fernway/delivery";
import { answer, gate } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { currentPerson } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const p = await currentPerson();
  if (!p) return answer(401, { ok: false, problems: ["form: you were signed out; sign in again"] });
  const r = await updateProfile(delivery().db, p, g.body);
  return r.ok ? answer(200, { ok: true, savedAt: new Date().toISOString() }) : answer(422, r);
}
