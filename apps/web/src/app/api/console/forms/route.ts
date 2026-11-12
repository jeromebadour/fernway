import { saveForm } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { manager, outcome } from "@/lib/console-api";

export const dynamic = "force-dynamic";

// Makes an embed form (no id) or changes one (its id). Owners and admins; written to the audit log.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const { id, ...input } = s.body;
  const r = await saveForm(delivery().db, s.m, input, id === undefined ? undefined : Number(id));
  return outcome(r, id === undefined ? 201 : 200);
}
