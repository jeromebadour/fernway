import { setScoring } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, manager } from "@/lib/console-api";

export const dynamic = "force-dynamic";

// Turns Claude's lead score on or off for the account. Owners and admins; written to the audit log.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  if (typeof s.body.on !== "boolean") return answer(422, { ok: false, problems: ["on: true or false"] });
  const ok = await setScoring(delivery().db, s.m, s.body.on);
  return ok ? answer(200, { ok: true, on: s.body.on }) : answer(403, { ok: false, problems: ["only the owner or an admin may change lead score"] });
}
