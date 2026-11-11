import { authorizeUrl, connectState, verifyValue } from "@fernway/delivery";
import { accountsOn } from "@/lib/accounts-on";
import { CONNECT_COOKIE, delivery } from "@/lib/connect";
import { currentPerson } from "@/lib/session";

export const dynamic = "force-dynamic";

// Connect GHL: from the console, by the account's owner or an admin; or by a signed setup link made on the box
// (apps/worker cli connect-link), valid 30 minutes. The browser then carries a signed state through GHL.
export async function GET(request: Request) {
  const { cfg } = delivery();
  const t = new URL(request.url).searchParams.get("t");
  let accountId: number | null = null;
  let by: { userId: number; name: string } | undefined;
  if (t) {
    accountId = verifyValue<{ accountId: number }>(cfg.key, "setup", t)?.accountId ?? null;
  } else if (accountsOn()) {
    const p = await currentPerson();
    if (p && p.role !== "member") { accountId = p.accountId; by = { userId: p.userId, name: p.name }; }
  }
  if (accountId === null) return Response.redirect(new URL(t ? "/connected?problem=link" : "/console/ghl?problem=not-allowed", cfg.redirectUri), 303);
  const state = connectState(cfg, accountId, by);
  const headers = new Headers({ Location: authorizeUrl(cfg, state) });
  headers.append("Set-Cookie", `${CONNECT_COOKIE}=${state}; Path=/api/connect; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}
