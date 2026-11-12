import { removeHook } from "@fernway/delivery";
import { answer, manager } from "@/lib/console-api";
import { hookCtx } from "@/lib/hooks";

export const dynamic = "force-dynamic";

// Removes an endpoint and its deliveries. Owners and admins; audited.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const ok = await removeHook(hookCtx().db, s.m, Number(s.body.id));
  return ok ? answer(200, { ok: true }) : answer(s.m.role === "member" ? 403 : 404, { ok: false, problems: ["form: that endpoint is not in this account"] });
}
