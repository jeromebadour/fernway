import { audit, completeConnect, OAuthError, readConnectState } from "@fernway/delivery";
import { CONNECT_COOKIE, delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// GHL sends the owner back here with a one-time code. The attempt must come back to the same browser that started
// it (the signed cookie), and if GHL returns our state it must be the same one: nobody can attach their GHL to
// someone else's Fernway account with a link.
export async function GET(request: Request) {
  const { db, cfg } = delivery();
  const url = new URL(request.url);
  const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${CONNECT_COOKIE}=([^;]+)`))?.[1] ?? null;
  const returned = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  const state = readConnectState(cfg, cookie);
  // Started from the console: the answer lands back there.
  const done = (query: string) => {
    const page = state?.by ? "/console/ghl" : "/connected";
    const headers = new Headers({ Location: new URL(`${page}?${query}`, cfg.redirectUri).toString() });
    headers.append("Set-Cookie", `${CONNECT_COOKIE}=; Path=/api/connect; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 303, headers });
  };

  if (!state || (returned && returned !== cookie)) return done("problem=expired");
  if (!code) return done("problem=declined");
  try {
    const r = await completeConnect(db, cfg, code, state.accountId);
    if (state.by) {
      await audit(db, { accountId: state.accountId, ...state.by }, "ghl.connected", { kind: "ghl", id: r.locationId }, `${r.scopes.length} permissions`);
      return done("done=ghl-connected");
    }
    return done(`location=${encodeURIComponent(r.locationId)}&scopes=${r.scopes.length}`);
  } catch (err) {
    const kind = err instanceof OAuthError ? err.kind : null;
    console.error(`connect: ${err instanceof Error ? err.message : String(err)}`);
    return done(kind === "none" ? "problem=agency" : kind === "several" ? "problem=several" : "problem=refused");
  }
}
