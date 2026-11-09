// The GHL API v2 client the engine uses: two calls, both upserts, so sending the same lead twice never makes a second
// contact or a second opportunity. Endpoints and headers as in GHL's API docs (services.leadconnectorhq.com,
// Version 2021-07-28). Contact upsert follows the sub-account's "Allow Duplicate Contact" setting, which must match
// on email and phone; Fernway's own idempotency key stops duplicates before GHL is ever called.
import type { LeadContact } from "./schema.js";

export const GHL_API = "https://services.leadconnectorhq.com";
export const GHL_VERSION = "2021-07-28";

/** One connected GHL sub-account. The token source refreshes on its own; `refresh` forces it after a 401. */
export type GhlConnection = {
  locationId: string;
  accessToken(): Promise<string>;
  refresh(): Promise<void>;
};

/** What happened, sorted by what Fernway should do next. */
export type GhlAnswer =
  | { ok: true; status: number; id: string; excerpt: string }
  | { ok: false; next: "retry" | "auth" | "hold"; status: number | null; excerpt: string };

export type GhlClient = {
  upsertContact(conn: GhlConnection, contact: LeadContact, tags: string[]): Promise<GhlAnswer & { sent: object }>;
  upsertOpportunity(
    conn: GhlConnection,
    o: { contactId: string; pipelineId: string; stageId: string; name: string },
  ): Promise<GhlAnswer & { sent: object }>;
};

const EXCERPT = 300;

/** 2xx delivered; 429, 5xx and no answer are worth retrying; 401 means the token; any other 4xx won't change by waiting. */
export function sortAnswer(status: number | null): "ok" | "retry" | "auth" | "hold" {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth";
  if (status === 429 || status === 408 || status >= 500) return "retry";
  return "hold";
}

export function createGhlClient(opts: { baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch } = {}): GhlClient {
  const base = (opts.baseUrl ?? GHL_API).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const doFetch = opts.fetch ?? fetch;

  async function call(conn: GhlConnection, path: string, body: object, pickId: (json: unknown) => string | undefined) {
    let status: number | null = null;
    let text = "";
    try {
      const res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await conn.accessToken()}`,
          Version: GHL_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      text = name === "TimeoutError" ? `no answer in ${timeoutMs / 1000} s` : `could not reach GHL (${err instanceof Error ? err.message : String(err)})`;
    }
    const excerpt = text.slice(0, EXCERPT);
    const sorted = sortAnswer(status);
    if (sorted === "ok") {
      let id: string | undefined;
      try {
        id = pickId(JSON.parse(text));
      } catch {
        id = undefined;
      }
      // A 2xx without the id we need can't be signed for: hold it and say so, rather than guess.
      if (!id) return { ok: false as const, next: "hold" as const, status, excerpt: `GHL answered ${status} without an id: ${excerpt}`, sent: body };
      return { ok: true as const, status: status!, id, excerpt, sent: body };
    }
    return { ok: false as const, next: sorted, status, excerpt, sent: body };
  }

  return {
    upsertContact(conn, c, tags) {
      const body = {
        locationId: conn.locationId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        companyName: c.companyName,
        website: c.website,
        tags,
        source: "Fernway",
      };
      return call(conn, "/contacts/upsert", body, (j) => (j as { contact?: { id?: string } })?.contact?.id);
    },
    upsertOpportunity(conn, o) {
      const body = {
        locationId: conn.locationId,
        contactId: o.contactId,
        pipelineId: o.pipelineId,
        pipelineStageId: o.stageId,
        name: o.name,
        status: "open",
      };
      return call(conn, "/opportunities/upsert", body, (j) => {
        const v = j as { opportunity?: { id?: string }; id?: string };
        return v?.opportunity?.id ?? v?.id;
      });
    },
  };
}
