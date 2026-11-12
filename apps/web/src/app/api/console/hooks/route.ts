import { saveHook } from "@fernway/delivery";
import { answer, manager } from "@/lib/console-api";
import { hookCtx, insecureHosts } from "@/lib/hooks";

export const dynamic = "force-dynamic";

// Makes a webhook endpoint (its secret is in this answer, once) or changes one. Owners and admins; audited.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const c = hookCtx();
  const b = s.body;
  const r = await saveHook(c.db, c.key, s.m, {
    id: typeof b.id === "number" ? b.id : undefined, label: String(b.label ?? ""), url: String(b.url ?? ""),
    events: Array.isArray(b.events) ? b.events.map(String) : [],
  }, insecureHosts());
  return r.ok ? answer(200, r) : answer(r.problems.some((p) => p.startsWith("only the")) ? 403 : 422, r);
}
