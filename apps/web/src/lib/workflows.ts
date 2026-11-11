import "server-only";
import { timingSafeEqual } from "node:crypto";
import { within } from "./session";

// GHL signs neither its workflow-trigger subscriptions nor its action calls; the app's settings in GHL send this
// header with each, set to a secret only GHL and Fernway know (FERNWAY_WORKFLOW_KEY). Without the secret set, the
// workflow addresses stay shut.
export async function fromGhlWorkflows(request: Request): Promise<Response | null> {
  const want = process.env.FERNWAY_WORKFLOW_KEY ?? "";
  if (want.length < 24) return Response.json({ ok: false, problems: ["not switched on"] }, { status: 503 });
  const got = Buffer.from(request.headers.get("x-fernway-key") ?? "");
  const w = Buffer.from(want);
  if (got.length !== w.length || !timingSafeEqual(got, w)) return Response.json({ ok: false, problems: ["key: not a call from Fernway's app"] }, { status: 401 });
  if (!(await within("workflows:all", 6000))) return Response.json({ ok: false, problems: ["limit: too many calls this hour"] }, { status: 429 });
  return null;
}
