import "server-only";
import { ghlAppWho, type GhlAppWho } from "@fernway/delivery";
import { delivery } from "./connect";

/** The app's shared secret from GHL's developer portal; without it the page inside GHL stays closed. */
export const ghlSsoKey = () => process.env.GHL_SSO_KEY ?? "";

/** The GHL user behind a call from Fernway's page inside GHL (its ticket rides in the Authorization header). */
export function appWho(request: Request): GhlAppWho | null {
  const h = request.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? ghlAppWho(delivery().cfg.key, h.slice(7)) : null;
}

export const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
