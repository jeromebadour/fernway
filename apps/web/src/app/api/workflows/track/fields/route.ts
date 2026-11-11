import { actionFields } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { fromGhlWorkflows } from "@/lib/workflows";

export const dynamic = "force-dynamic";

// The "Track with Fernway" settings in GHL's workflow builder: the sub-account's own routes to pick from.
export async function POST(request: Request) {
  const refused = await fromGhlWorkflows(request);
  if (refused) return refused;
  const f = await actionFields(delivery().db, await request.json().catch(() => null));
  return f ? Response.json(f) : Response.json({ ok: false }, { status: 400 });
}
