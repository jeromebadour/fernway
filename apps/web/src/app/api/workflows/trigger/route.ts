import { GHL_API, subscribe } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { fromGhlWorkflows, noteMisfit } from "@/lib/workflows";

export const dynamic = "force-dynamic";

// GHL's subscription address for the "Fernway lead" workflow trigger: a workflow made, changed or deleted it.
export async function POST(request: Request) {
  const refused = await fromGhlWorkflows(request);
  if (refused) return refused;
  const body = await request.json().catch(() => null);
  const r = await subscribe(delivery().db, body, process.env.FERNWAY_GHL_API ?? GHL_API);
  if (!r.ok && r.why === "body") noteMisfit("trigger", request, body);
  if (r.ok) return Response.json(r);
  return Response.json(r, { status: r.why === "not-connected" ? 404 : 422 });
}
