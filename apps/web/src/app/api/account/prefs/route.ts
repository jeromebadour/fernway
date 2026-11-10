import { savePrefs } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  const r = await savePrefs(delivery().db, s.p.userId, s.body);
  return r.ok ? answer(200, { ok: true, savedAt: new Date().toISOString() }) : answer(422, r);
}
