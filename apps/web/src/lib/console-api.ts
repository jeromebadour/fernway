import "server-only";
import type { Manager } from "@fernway/delivery";
import { answer, signedIn } from "./account-api";

export { answer };

/** For the console's managing routes: switched on, from this site, signed in; the person as the one making the change. */
export async function manager(request: Request): Promise<{ body: Record<string, unknown>; m: Manager } | { refused: Response }> {
  const s = await signedIn(request);
  if ("refused" in s) return s;
  return { body: s.body, m: { accountId: s.p.accountId, userId: s.p.userId, name: s.p.name, role: s.p.role } };
}

/** The answer for a change: 200 when made, else 403 for a role that may not, 422 for the rest. */
export const outcome = (r: { ok: true } | { ok: false; problems: string[] }, made = 200) =>
  r.ok ? answer(made, r) : answer(r.problems.some((p) => p.includes("only the")) ? 403 : 422, r);
