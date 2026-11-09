import "server-only";
import { createDb, keyFrom, oauthConfigFromEnv, type Db, type OAuthConfig } from "@fernway/delivery";

// The app's own database handle (as fernway_app) and the OAuth settings, made once per server process.
const g = globalThis as unknown as { fernwayDelivery?: { db: Db; cfg: OAuthConfig } };

export function delivery() {
  if (!g.fernwayDelivery) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const key = keyFrom(process.env.FERNWAY_TOKEN_KEY);
    g.fernwayDelivery = { db: createDb(url, 5).db, cfg: oauthConfigFromEnv(process.env, key) };
  }
  return g.fernwayDelivery;
}

export const CONNECT_COOKIE = "fw_connect";
