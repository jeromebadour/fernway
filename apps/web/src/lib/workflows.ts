import "server-only";
import { timingSafeEqual } from "node:crypto";
import { shape } from "@fernway/delivery";
import { within } from "./session";

// GHL signs neither its workflow-trigger subscriptions nor its action calls; the app's settings in GHL send the
// Authorization header with each (GHL's header names allow letters only), set to a secret only GHL and Fernway know
// (FERNWAY_WORKFLOW_KEY), bare or as "Bearer <key>". Without the secret set, the workflow addresses stay shut.
/** Writes to the web log which field and header names a GHL workflow call carried, never a value: so a call GHL shapes
 * differently from its documentation can be read on the box. */
export function noteMisfit(where: string, request: Request, body: unknown): void {
  const headers = [...request.headers.keys()].filter((k) => !["authorization", "cookie"].includes(k)).sort().join(",");
  console.warn(`workflows: ${where} call didn't fit; body ${shape(body)}; headers ${headers}`);
}

export async function fromGhlWorkflows(request: Request): Promise<Response | null> {
  const want = process.env.FERNWAY_WORKFLOW_KEY ?? "";
  if (want.length < 24) return Response.json({ ok: false, problems: ["not switched on"] }, { status: 503 });
  const got = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim());
  const w = Buffer.from(want);
  if (got.length !== w.length || !timingSafeEqual(got, w)) return Response.json({ ok: false, problems: ["key: not a call from Fernway's app"] }, { status: 401 });
  if (!(await within("workflows:all", 6000))) return Response.json({ ok: false, problems: ["limit: too many calls this hour"] }, { status: 429 });
  return null;
}
