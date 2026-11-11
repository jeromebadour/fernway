import { GHL_API, subscribe } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { fromGhlWorkflows } from "@/lib/workflows";

export const dynamic = "force-dynamic";

// GHL's subscription address for the "Fernway lead" workflow trigger: a workflow made, changed or deleted it.
export async function POST(request: Request) {
  const refused = await fromGhlWorkflows(request);
  if (refused) return refused;
  const r = await subscribe(delivery().db, await request.json().catch(() => null), process.env.FERNWAY_GHL_API ?? GHL_API);
  if (r.ok) return Response.json(r);
  return Response.json(r, { status: r.why === "not-connected" ? 404 : 422 });
}
