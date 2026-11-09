import { completeConnect, OAuthError, readConnectState } from "@fernway/delivery";
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

  const done = (query: string) => {
    const headers = new Headers({ Location: new URL(`/connected?${query}`, cfg.redirectUri).toString() });
    headers.append("Set-Cookie", `${CONNECT_COOKIE}=; Path=/api/connect; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 303, headers });
  };

  const state = readConnectState(cfg, cookie);
  if (!state || (returned && returned !== cookie)) return done("problem=expired");
  if (!code) return done("problem=declined");
  try {
    const r = await completeConnect(db, cfg, code, state.accountId);
    return done(`location=${encodeURIComponent(r.locationId)}&scopes=${r.scopes.length}`);
  } catch (err) {
    const agency = err instanceof OAuthError && err.message.includes("sub-account");
    console.error(`connect: ${err instanceof Error ? err.message : String(err)}`);
    return done(agency ? "problem=agency" : "problem=refused");
  }
}
