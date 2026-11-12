import { testHook } from "@fernway/delivery";
import { answer, manager } from "@/lib/console-api";
import { hookCtx } from "@/lib/hooks";

export const dynamic = "force-dynamic";

// Sends a signed test to one endpoint now, and answers with what it said back. Owners and admins.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const r = await testHook(hookCtx(), s.m, Number(s.body.id));
  return r.ok ? answer(200, r) : answer(s.m.role === "member" ? 403 : 404, r);
}
