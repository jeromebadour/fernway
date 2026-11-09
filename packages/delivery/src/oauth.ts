// Connecting a GHL sub-account the way a Marketplace app does: the owner presses Connect GHL, picks the sub-account
// in GHL and approves; GHL sends a one-time code to /api/connect/callback; Fernway swaps it for tokens and keeps them
// encrypted. Endpoints and fields as in GHL's OAuth docs: the install link from the app's Auth page, and
// POST services.leadconnectorhq.com/oauth/token, form-encoded, user_type Location. (The docs show JSON for the code
// exchange; the real API refuses it with "content must be application/x-www-form-urlencoded", seen 2026-11-10.)
// Access tokens last about 24 h; a refresh token works once and comes back new each time.
// An agency can install the app for its sub-accounts (GHL forces "bulk install" on for private apps). Then the code
// swap answers with an agency (Company) token, and Fernway trades it for the sub-account's own token: it asks GHL
// where the app is installed (GET /oauth/installedLocations) and swaps (POST /oauth/locationToken). Both need the
// oauth.readonly and oauth.write scopes. The sub-account token comes with its own refresh token, so from there on the
// connection is the same as a direct sub-account install.
import { eq, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { open, seal, signValue, verifyValue } from "./crypto.js";
import { GHL_API, GHL_VERSION, ReconnectNeeded, type GhlConnection } from "./ghl.js";
import { ghlConnections } from "./schema.js";

export const SCOPES = [
  "contacts.write",
  "contacts.readonly",
  "opportunities.readonly",
  "opportunities.write",
  "calendars.readonly",
  "calendars/events.readonly",
  "calendars/events.write",
  "locations/customFields.readonly",
  "locations.readonly",
  "workflows.readonly",
  "oauth.readonly",
  "oauth.write",
] as const;

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  key: Buffer;
  authorizeUrl?: string;
  apiBase?: string;
  fetch?: typeof fetch;
};

const AUTHORIZE = "https://marketplace.gohighlevel.com/v2/oauth/chooselocation";
const STATE_TTL = 15 * 60_000;
// Refresh a little before GHL's expiry, so no request leaves with a token about to lapse.
const REFRESH_MARGIN = 5 * 60_000;

export type ConnectState = { accountId: number; nonce: string };

export function connectState(cfg: OAuthConfig, accountId: number): string {
  return signValue(cfg.key, "connect", { accountId, nonce: crypto.randomUUID() }, STATE_TTL);
}

export function readConnectState(cfg: OAuthConfig, token: string | null | undefined) {
  return verifyValue<ConnectState>(cfg.key, "connect", token);
}

/** The install link, exactly as the app's Auth page shows it, plus the signed state for this attempt. */
export function authorizeUrl(cfg: OAuthConfig, state: string): string {
  const u = new URL(cfg.authorizeUrl ?? AUTHORIZE);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("scope", SCOPES.join(" "));
  // The app's version id is the client id's first part ("<appId>-<suffix>").
  u.searchParams.set("version_id", cfg.clientId.split("-")[0]!);
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenAnswer = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
  userType?: string;
};

/** kind says what the owner must do differently: install the app in a sub-account, or in just one. */
export class OAuthError extends Error {
  constructor(message: string, readonly status: number | null, readonly kind: "none" | "several" | null = null) {
    super(message);
  }
}

async function ghlCall<T>(cfg: OAuthConfig, path: string, init: RequestInit): Promise<T> {
  const url = `${(cfg.apiBase ?? GHL_API).replace(/\/$/, "")}${path}`;
  const doFetch = cfg.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new OAuthError(`could not reach GHL (${err instanceof Error ? err.message : String(err)})`, null);
  }
  const text = await res.text();
  if (!res.ok) throw new OAuthError(`GHL answered ${res.status} on ${path.split("?")[0]}: ${text.slice(0, 200)}`, res.status);
  return JSON.parse(text) as T;
}

function checkTokens(t: TokenAnswer): TokenAnswer {
  if (!t.access_token || !t.refresh_token || !t.expires_in) throw new OAuthError("GHL's answer had no tokens", null);
  return t;
}

async function tokenCall(cfg: OAuthConfig, body: Record<string, string>, form: boolean): Promise<TokenAnswer> {
  return checkTokens(
    await ghlCall<TokenAnswer>(cfg, "/oauth/token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    }),
  );
}

/** Agency token to sub-account token: the one sub-account the app is installed in. */
async function locationFromAgency(cfg: OAuthConfig, agency: TokenAnswer): Promise<TokenAnswer> {
  if (!agency.companyId) throw new OAuthError("GHL's agency answer had no company id", null);
  const auth = { Authorization: `Bearer ${agency.access_token}`, Version: GHL_VERSION, Accept: "application/json" };
  const q = new URLSearchParams({ companyId: agency.companyId, appId: cfg.clientId.split("-")[0]!, isInstalled: "true", limit: "100" });
  const found = await ghlCall<{ locations?: { _id: string; name: string }[] }>(cfg, `/oauth/installedLocations?${q}`, { method: "GET", headers: auth });
  const locations = found.locations ?? [];
  if (locations.length === 0) throw new OAuthError("GHL connected an agency, not a sub-account: no sub-account has the app installed", null, "none");
  // One Fernway account delivers into one sub-account. Guessing among several would send leads to the wrong place.
  if (locations.length > 1) {
    throw new OAuthError(`GHL installed the app in ${locations.length} sub-accounts: install it in one sub-account only`, null, "several");
  }
  const t = checkTokens(
    await ghlCall<TokenAnswer>(cfg, "/oauth/locationToken", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: agency.companyId, locationId: locations[0]!._id }).toString(),
    }),
  );
  if (t.locationId !== locations[0]!._id) throw new OAuthError("GHL's sub-account token was for another sub-account", null);
  return t;
}

/** The callback: swaps GHL's one-time code for tokens and saves the connection for the account in the state. */
export async function completeConnect(db: Db, cfg: OAuthConfig, code: string, accountId: number) {
  let t = await tokenCall(
    cfg,
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Location",
      redirect_uri: cfg.redirectUri,
    },
    true,
  );
  if (!t.locationId) t = await locationFromAgency(cfg, t);
  const values = {
    accountId,
    locationId: t.locationId!,
    companyId: t.companyId ?? null,
    userId: t.userId ?? null,
    scopes: t.scope ?? SCOPES.join(" "),
    accessTokenEnc: seal(cfg.key, t.access_token),
    refreshTokenEnc: seal(cfg.key, t.refresh_token),
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    status: "connected" as const,
    lastError: null,
  };
  await db
    .insert(ghlConnections)
    .values(values)
    .onConflictDoUpdate({
      target: ghlConnections.accountId,
      set: { ...values, connectedAt: sql`now()`, refreshedAt: null, updatedAt: sql`now()` },
    });
  return { locationId: t.locationId!, scopes: values.scopes.split(" ").filter(Boolean) };
}

/**
 * The account's live connection. A token near its expiry is refreshed first. The refresh holds the row lock, and the
 * second of two workers re-reads after it, so only one of them spends the single-use refresh token.
 */
export async function connectionFor(db: Db, cfg: OAuthConfig, accountId: number): Promise<GhlConnection | null> {
  const [row] = await db.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId));
  if (!row) return null;
  const conn: GhlConnection = {
    locationId: row.locationId,
    async accessToken() {
      const [now] = await db.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId));
      if (!now) throw new ReconnectNeeded("GHL was disconnected for this account");
      if (now.status !== "connected") throw new ReconnectNeeded(`GHL connection needs reconnecting: ${now.lastError}`);
      if (now.expiresAt.getTime() - REFRESH_MARGIN > Date.now()) return open(cfg.key, now.accessTokenEnc);
      return refreshNow(db, cfg, accountId, false);
    },
    async refresh() {
      await refreshNow(db, cfg, accountId, true);
    },
  };
  return conn;
}

export async function refreshNow(db: Db, cfg: OAuthConfig, accountId: number, force: boolean): Promise<string> {
  // The transaction commits first (with the "needs reconnecting" mark if GHL refused), then the error is raised.
  const result = await db.transaction(async (tx): Promise<{ token: string } | { reconnect: string }> => {
    const [row] = await tx.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId)).for("update");
    if (!row) throw new ReconnectNeeded("GHL was disconnected for this account");
    if (row.status !== "connected") throw new ReconnectNeeded(`GHL connection needs reconnecting: ${row.lastError}`);
    // Someone refreshed while we waited for the lock: use theirs. A forced refresh (after a 401) skips this only if
    // the token is older than a minute, so two workers seeing the same 401 still refresh once.
    const fresh = row.refreshedAt && row.refreshedAt.getTime() > Date.now() - 60_000;
    if ((!force && row.expiresAt.getTime() - REFRESH_MARGIN > Date.now()) || (force && fresh)) {
      return { token: open(cfg.key, row.accessTokenEnc) };
    }
    let t: TokenAnswer;
    try {
      t = await tokenCall(
        cfg,
        {
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "refresh_token",
          refresh_token: open(cfg.key, row.refreshTokenEnc),
          user_type: "Location",
          redirect_uri: cfg.redirectUri,
        },
        true,
      );
    } catch (err) {
      // GHL refusing the refresh token itself (revoked, uninstalled) won't fix itself: the owner must reconnect.
      if (err instanceof OAuthError && (err.status === 400 || err.status === 401)) {
        await tx
          .update(ghlConnections)
          .set({ status: "needs_reconnect", lastError: err.message.slice(0, 300), updatedAt: sql`now()` })
          .where(eq(ghlConnections.accountId, accountId));
        return { reconnect: `GHL connection needs reconnecting: ${err.message}` };
      }
      throw err;
    }
    await tx
      .update(ghlConnections)
      .set({
        accessTokenEnc: seal(cfg.key, t.access_token),
        refreshTokenEnc: seal(cfg.key, t.refresh_token),
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
        refreshedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(ghlConnections.accountId, accountId));
    return { token: t.access_token };
  });
  if ("reconnect" in result) throw new ReconnectNeeded(result.reconnect);
  return result.token;
}

export function oauthConfigFromEnv(env: NodeJS.ProcessEnv, key: Buffer): OAuthConfig {
  const need = (n: string) => {
    const v = env[n];
    if (!v) throw new Error(`${n} is not set`);
    return v;
  };
  return {
    clientId: need("GHL_CLIENT_ID"),
    clientSecret: need("GHL_CLIENT_SECRET"),
    redirectUri: `${need("APP_URL").replace(/\/$/, "")}/api/connect/callback`,
    key,
  };
}
