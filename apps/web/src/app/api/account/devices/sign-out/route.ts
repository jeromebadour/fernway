import { signOutDevice } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// Signs out one other device of the signed-in person.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  const ok = await signOutDevice(delivery().db, s.p.userId, s.p.sessionId, Number(s.body.id));
  return ok ? answer(200, { ok: true }) : answer(404, { ok: false, problems: ["form: that device was already signed out"] });
}
