import { trackFromWorkflow } from "@fernway/delivery";
import { appUrl } from "@/lib/api";
import { delivery } from "@/lib/connect";
import { intake } from "@/lib/intake";
import { fromGhlWorkflows } from "@/lib/workflows";

export const dynamic = "force-dynamic";

// The "Track with Fernway" workflow action: the workflow's contact goes through a Fernway route; the waybill and its
// public receipt come back as workflow values.
export async function POST(request: Request) {
  const refused = await fromGhlWorkflows(request);
  if (refused) return refused;
  const r = await trackFromWorkflow(intake().deps, await request.json().catch(() => null), delivery().cfg.key, appUrl());
  if (r.ok) return Response.json({ waybill: r.waybill, receipt: r.receipt, state: r.state }, { status: r.duplicate ? 200 : 201 });
  return Response.json({ ok: false, problems: r.problems }, { status: r.status });
}
