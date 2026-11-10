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

/** The connection itself can't be used until the owner reconnects (revoked, uninstalled, or refused by GHL). */
export class ReconnectNeeded extends Error {
  override name = "ReconnectNeeded";
}

/** What happened, sorted by what Fernway should do next. */
export type GhlAnswer =
  | { ok: true; status: number; id: string; excerpt: string }
  | { ok: false; next: "retry" | "auth" | "hold"; status: number | null; excerpt: string };

export type Pipeline = { id: string; name: string; stages: { id: string; name: string }[] };

export type GhlClient = {
  listPipelines(conn: GhlConnection): Promise<Pipeline[]>;
  upsertContact(conn: GhlConnection, contact: LeadContact, tags: string[]): Promise<GhlAnswer & { sent: object }>;
  upsertOpportunity(
    conn: GhlConnection,
    o: { contactId: string; pipelineId: string; stageId: string; name: string },
  ): Promise<GhlAnswer & { sent: object }>;
  /** Adds the lead's message to the contact as a note (GHL's contacts have no free-text field). */
  addNote(conn: GhlConnection, contactId: string, body: string): Promise<GhlAnswer & { sent: object }>;
  /** Deletes a contact, opportunity or note ("contacts/<id>", "opportunities/<id>", "contacts/<id>/notes/<id>").
   *  True once GHL no longer has it (deleted now, or already gone: 404). */
  remove(conn: GhlConnection, path: string): Promise<{ gone: boolean; status: number | null }>;
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
    let token: string;
    try {
      token = await conn.accessToken();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A connection the owner must reconnect holds the lead with that reason; anything else is worth a retry.
      if (err instanceof ReconnectNeeded) return { ok: false as const, next: "hold" as const, status: null, excerpt: message, sent: body };
      return { ok: false as const, next: "retry" as const, status: null, excerpt: `could not get a GHL token (${message})`, sent: body };
    }
    try {
      const res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
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
    addNote(conn, contactId, body) {
      return call(conn, `/contacts/${encodeURIComponent(contactId)}/notes`, { body }, (j) => {
        const v = j as { note?: { id?: string }; id?: string };
        return v?.note?.id ?? v?.id;
      });
    },
    async remove(conn, path) {
      let status: number | null = null;
      try {
        const res = await doFetch(`${base}/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${await conn.accessToken()}`, Version: GHL_VERSION, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = res.status;
        await res.text();
      } catch {
        status = null;
      }
      return { gone: status !== null && ((status >= 200 && status < 300) || status === 404), status };
    },
    async listPipelines(conn) {
      const res = await doFetch(`${base}/opportunities/pipelines?locationId=${encodeURIComponent(conn.locationId)}`, {
        headers: { Authorization: `Bearer ${await conn.accessToken()}`, Version: GHL_VERSION, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`GHL answered ${res.status}: ${text.slice(0, 200)}`);
      const json = JSON.parse(text) as { pipelines?: { id: string; name: string; stages?: { id: string; name: string }[] }[] };
      return (json.pipelines ?? []).map((p) => ({ id: p.id, name: p.name, stages: (p.stages ?? []).map((st) => ({ id: st.id, name: st.name })) }));
    },
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
