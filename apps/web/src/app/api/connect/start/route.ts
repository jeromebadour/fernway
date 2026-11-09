import { authorizeUrl, connectState, verifyValue } from "@fernway/delivery";
import { CONNECT_COOKIE, delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// Connect GHL. Until accounts and the console exist (plan steps 5 and 6), the way in is a signed setup link made on
// the box (apps/worker cli connect-link), valid 30 minutes. The browser then carries a signed state through GHL.
export async function GET(request: Request) {
  const { cfg } = delivery();
  const setup = verifyValue<{ accountId: number }>(cfg.key, "setup", new URL(request.url).searchParams.get("t"));
  if (!setup) return Response.redirect(new URL("/connected?problem=link", cfg.redirectUri), 303);
  const state = connectState(cfg, setup.accountId);
  const res = Response.redirect(authorizeUrl(cfg, state), 302);
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", `${CONNECT_COOKIE}=${state}; Path=/api/connect; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}
