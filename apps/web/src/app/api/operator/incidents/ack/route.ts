import { acknowledge } from "@fernway/delivery";
import { answer } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { staffAction } from "@/lib/operator";

export const dynamic = "force-dynamic";

// Takes an incident, or adds a note to it. Staff only (404 for anyone else), with a fresh authenticator code; on the operator audit log.
export async function POST(request: Request) {
  const a = await staffAction(request);
  if ("refused" in a) return a.refused;
  const r = await acknowledge(delivery().db, a.s, Number(a.body.id), a.body.note);
  return answer(r.ok ? 200 : r.problems.some((p) => p.includes("only")) ? 403 : 422, r);
}
