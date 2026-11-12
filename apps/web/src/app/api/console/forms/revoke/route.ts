import { revokeForm } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, manager } from "@/lib/console-api";

export const dynamic = "force-dynamic";

// Revokes an embed form: every page carrying it shows it closed. Owners and admins; written to the audit log.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const ok = await revokeForm(delivery().db, s.m, Number(s.body.id));
  return ok ? answer(200, { ok: true }) : answer(s.m.role === "member" ? 403 : 404, { ok: false, problems: ["form: that form is not in this account"] });
}
