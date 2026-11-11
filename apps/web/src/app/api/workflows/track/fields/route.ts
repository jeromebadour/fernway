import { actionFields } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { fromGhlWorkflows, noteMisfit } from "@/lib/workflows";

export const dynamic = "force-dynamic";

// The "Track with Fernway" settings in GHL's workflow builder: the sub-account's own routes to pick from.
export async function POST(request: Request) {
  const refused = await fromGhlWorkflows(request);
  if (refused) return refused;
  const body = await request.json().catch(() => null);
  const f = await actionFields(delivery().db, body);
  if (!f) noteMisfit("track/fields", request, body);
  return f ? Response.json(f) : Response.json({ ok: false }, { status: 400 });
}
