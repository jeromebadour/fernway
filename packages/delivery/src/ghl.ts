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
  | { ok: true; status: number; id: string; excerpt: string; ms?: number }
  | { ok: false; next: "retry" | "auth" | "hold"; status: number | null; excerpt: string; ms?: number };

export type Pipeline = { id: string; name: string; stages: { id: string; name: string }[] };

export type GhlClient = {
  listPipelines(conn: GhlConnection): Promise<Pipeline[]>;
  upsertContact(conn: GhlConnection, contact: LeadContact, tags: string[]): Promise<GhlAnswer & { sent: object }>;
  upsertOpportunity(
    conn: GhlConnection,
    o: { contactId: string; pipelineId: string; stageId: string; name: string },
  ): Promise<GhlAnswer & { sent: object }>;
  listCalendars(conn: GhlConnection): Promise<{ id: string; name: string; minutes: number | null }[]>;
  /** Free start times (ISO, with offset) between two moments; GHL allows at most 31 days. */
  freeSlots(conn: GhlConnection, calendarId: string, from: Date, to: Date): Promise<string[]>;
  bookAppointment(
    conn: GhlConnection,
    a: { calendarId: string; contactId: string; startTime: string; title: string },
  ): Promise<GhlAnswer & { sent: object }>;
  /** Adds the lead's message to the contact as a note (GHL's contacts have no free-text field). */
  addNote(conn: GhlConnection, contactId: string, body: string): Promise<GhlAnswer & { sent: object }>;
  /** Adds tags to a contact (POST /contacts/{id}/tags); tags it already has stay. */
  addTags(conn: GhlConnection, contactId: string, tags: string[]): Promise<GhlAnswer & { sent: object }>;
  /** Takes tags off a contact (DELETE /contacts/{id}/tags); tags it doesn't have are no matter. */
  removeTags(conn: GhlConnection, contactId: string, tags: string[]): Promise<GhlAnswer & { sent: object }>;
  /** Deletes a contact, opportunity or note ("contacts/<id>", "opportunities/<id>", "contacts/<id>/notes/<id>").
   *  True once GHL no longer has it (deleted now, or already gone: 404). */
  remove(conn: GhlConnection, path: string): Promise<{ gone: boolean; status: number | null }>;
  /** A contact as GHL holds it now; null when GHL has no such contact (404). Throws when GHL can't be reached. */
  getContact(conn: GhlConnection, contactId: string): Promise<GhlContact | null>;
};

export type GhlContact = { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  companyName: string | null; website: string | null; tags: string[]; dateAdded: string | null; source: string | null };

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

  async function call(conn: GhlConnection, path: string, body: object, pickId: (json: unknown) => string | undefined, method: "POST" | "DELETE" = "POST") {
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
    // How long GHL took to answer (or until Fernway stopped waiting), for the status page.
    const started = performance.now();
    try {
      const res = await doFetch(`${base}${path}`, {
        method,
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
    const ms = Math.round(performance.now() - started);
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
      if (!id) return { ok: false as const, next: "hold" as const, status, excerpt: `GHL answered ${status} without an id: ${excerpt}`, sent: body, ms };
      return { ok: true as const, status: status!, id, excerpt, sent: body, ms };
    }
    return { ok: false as const, next: sorted, status, excerpt, sent: body, ms };
  }

  async function get(conn: GhlConnection, path: string): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${await conn.accessToken()}`, Version: GHL_VERSION, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GHL answered ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  return {
    async getContact(conn, contactId) {
      const res = await doFetch(`${base}/contacts/${encodeURIComponent(contactId)}`, {
        headers: { Authorization: `Bearer ${await conn.accessToken()}`, Version: GHL_VERSION, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GHL answered ${res.status}: ${text.slice(0, 200)}`);
      const c = (JSON.parse(text) as { contact?: Record<string, unknown> }).contact ?? {};
      const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
      return {
        id: String(c.id ?? contactId), firstName: str(c.firstName), lastName: str(c.lastName), email: str(c.email), phone: str(c.phone),
        companyName: str(c.companyName), website: str(c.website), tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        dateAdded: str(c.dateAdded), source: str(c.source),
      };
    },
    addNote(conn, contactId, body) {
      return call(conn, `/contacts/${encodeURIComponent(contactId)}/notes`, { body }, (j) => {
        const v = j as { note?: { id?: string }; id?: string };
        return v?.note?.id ?? v?.id;
      });
    },
    // GHL answers a tag change with the contact's tags, not an id: a 2xx is enough.
    addTags(conn, contactId, tags) {
      return call(conn, `/contacts/${encodeURIComponent(contactId)}/tags`, { tags }, () => "tags");
    },
    removeTags(conn, contactId, tags) {
      return call(conn, `/contacts/${encodeURIComponent(contactId)}/tags`, { tags }, () => "tags", "DELETE");
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
    async listCalendars(conn) {
      const json = (await get(conn, `/calendars/?locationId=${encodeURIComponent(conn.locationId)}`)) as {
        calendars?: { id: string; name: string; slotDuration?: number; slotDurationUnit?: string }[];
      };
      return (json.calendars ?? []).map((c) => ({
        id: c.id, name: c.name, minutes: c.slotDuration ? (c.slotDurationUnit === "hours" ? c.slotDuration * 60 : c.slotDuration) : null,
      }));
    },
    async freeSlots(conn, calendarId, from, to) {
      const q = new URLSearchParams({ startDate: String(from.getTime()), endDate: String(to.getTime()), timezone: "UTC" });
      const json = (await get(conn, `/calendars/${encodeURIComponent(calendarId)}/free-slots?${q}`)) as Record<string, { slots?: string[] } | unknown>;
      // Keyed by date ("2026-11-10": { slots: [...] }); anything else GHL adds (a traceId) is not a day.
      return Object.entries(json)
        .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === "object" && Array.isArray((v as { slots?: unknown }).slots))
        .flatMap(([, v]) => (v as { slots: string[] }).slots)
        .sort((a, b) => Date.parse(a) - Date.parse(b));
    },
    bookAppointment(conn, a) {
      const body = {
        locationId: conn.locationId, calendarId: a.calendarId, contactId: a.contactId, startTime: a.startTime, title: a.title,
        appointmentStatus: "confirmed", meetingLocationType: "custom", address: "Video call, link sent by email",
      };
      return call(conn, "/calendars/events/appointments", body, (j) => (j as { id?: string })?.id);
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
