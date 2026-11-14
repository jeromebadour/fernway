import type { Metadata } from "next";
import { examples, openApi, scanKinds } from "@fernway/delivery";
import { appUrl, DEMO_SENDS_HOUR, PER_KEY_MINUTE } from "@/lib/api";
import { CodeBlock } from "@/ui/code-block";
import { DocsFrame } from "@/ui/docs-frame";
import { GDown, GManifest } from "@/ui/glyphs";

export const metadata: Metadata = { title: "API reference · Fernway", description: "Fernway API v1: send a lead, track a lead, read a booking route's free times." };
export const dynamic = "force-dynamic";

// Everything below about requests and answers is read from the OpenAPI document, which is generated from the same
// schemas the API checks and answers with. Only the prose around it is written here.

type Js = { type?: string | string[]; format?: string; pattern?: string; maxLength?: number; minLength?: number; enum?: string[]; description?: string; properties?: Record<string, Js>; required?: string[] };

const typeOf = (s: Js) => {
  if (s.enum) return s.enum.join(" | ");
  const t = Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "any");
  return s.format ? `${t} (${s.format})` : t;
};

// Every field, nested ones included, as one flat numbered list (BUILD-RULES 3.1).
function flatten(schema: Js, prefix = ""): { name: string; s: Js; required: boolean }[] {
  const req = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([name, s]) => [
    { name: `${prefix}${name}`, s, required: req.has(name) },
    ...(s.properties ? flatten(s, `${prefix}${name}.`) : []),
  ]);
}

function Fields({ schema }: { schema: Js }) {
  return (
    <>
      {flatten(schema).map(({ name, s, required }, i) => (
        <tr key={name}>
          <td className="dc-num">{i + 1}</td>
          <td><code>{name}</code>{required && <span className="dc-req">required</span>}</td>
          <td><code className="dc-type">{s.properties ? "object" : typeOf(s)}</code></td>
          <td>{s.description}</td>
        </tr>
      ))}
    </>
  );
}

const sections = [
  { id: "auth", label: "Authentication" },
  { id: "limits", label: "Limits" },
  { id: "send", label: "POST /api/v1/leads" },
  { id: "get", label: "GET /api/v1/leads/{number}" },
  { id: "slots", label: "GET /api/v1/routes/{route}/slots" },
  { id: "scans", label: "Scans" },
];

const scanMeaning: Record<(typeof scanKinds)[number], string> = {
  picked_up: "Fernway took the lead in.",
  checked: "The lead passed its checks.",
  handed: "A step went to GHL and GHL took it.",
  signed: "Every step is in GHL. The lead is delivered.",
  retry_scheduled: "GHL was busy, down or silent; the next try is booked.",
  held: "GHL refused it for a reason a retry can't fix.",
  returned: "Out of tries after 24 hours.",
  resent: "Someone sent a held lead again after fixing it.",
  ghl_moved: "In GHL, someone moved its deal to another stage, or marked it won or lost.",
  ghl_changed: "In GHL, its meeting was moved, confirmed or cancelled.",
  ghl_deleted: "In GHL, its contact, deal or meeting was deleted.",
};

type Op = { summary: string; description: string; requestBody?: { content: { "application/json": { schema: Js; example: unknown } } }; responses: Record<string, { description: string; content: { "application/json": { example?: unknown } } }> };

function Responses({ op }: { op: Op }) {
  return (
    <table className="dc-table">
      <thead><tr><th className="dc-num">#</th><th>Status</th><th>Means</th></tr></thead>
      <tbody>{Object.entries(op.responses).sort(([a], [b]) => (a === "201" ? -1 : b === "201" ? 1 : Number(a) - Number(b))).map(([code, r], i) => <tr key={code}><td className="dc-num">{i + 1}</td><td><code className={Number(code) < 300 ? "dc-ok" : "dc-no"}>{code}</code></td><td>{r.description}</td></tr>)}</tbody>
    </table>
  );
}

/** An API path that may break only after a slash on a narrow screen, never inside a word. */
function Path({ p }: { p: string }) {
  return <>{p.split("/").map((part, i) => (i === 0 ? part : <span key={i}>/<wbr />{part}</span>))}</>;
}

export default function ApiReference() {
  const doc = openApi(appUrl());
  const post = doc.paths["/api/v1/leads"].post as unknown as Op;
  const get = doc.paths["/api/v1/leads/{number}"].get as unknown as Op;
  const slots = doc.paths["/api/v1/routes/{route}/slots"].get as unknown as Op;
  const base = appUrl();

  return (
    <DocsFrame current="/docs/api" sections={sections}>
      <header className="dc-head">
        <p className="wb-eyebrow"><GManifest size={16} />Docs · API reference</p>
        <h1 className="fm-h1">Fernway API v1</h1>
        <p className="wb-sec-lede">Three calls: send a lead, track it, and read a booking route&rsquo;s free times. JSON in and out, at <code>{base}</code>. The same reference as a file: <a href="/api/v1/openapi.json"><GDown size={15} />OpenAPI 3.1</a>.</p>
      </header>

      <section id="auth" className="dc-sec">
        <h2>Authentication</h2>
        <p>Send your key as a bearer token on every request. A key belongs to one account and reaches only that account&rsquo;s leads. It is shown once when it is made; Fernway keeps only its hash, so a lost key is replaced, not recovered. A revoked key stops at once.</p>
        <CodeBlock label="Header" code="Authorization: Bearer fw_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </section>

      <section id="limits" className="dc-sec">
        <h2>Limits</h2>
        <p>{PER_KEY_MINUTE} requests a minute per key. Over it, the answer is <code>429</code> with a <code>Retry-After</code> header in seconds. The public demo key is shared, so it is limited per visitor instead: {DEMO_SENDS_HOUR} leads an hour.</p>
      </section>

      <section id="send" className="dc-sec">
        <h2><span className="dc-verb dc-post">POST</span><code><Path p="/api/v1/leads" /></code></h2>
        <p className="dc-sum">{post.summary}. {post.description}</p>
        <h3>Body</h3>
        <table className="dc-table dc-fields">
          <thead><tr><th className="dc-num">#</th><th>Field</th><th>Type</th><th>About</th></tr></thead>
          <tbody><Fields schema={post.requestBody!.content["application/json"].schema} /></tbody>
        </table>
        <p className="dc-small">Send only these fields. An unknown field is refused, so a typo can&rsquo;t drop data without you knowing.</p>
        <div className="dc-pair dc-pair-even">
          <CodeBlock label="Request body" code={JSON.stringify(examples.lead, null, 2)} />
          <CodeBlock label="201 answer" code={JSON.stringify(examples.accepted, null, 2)} />
        </div>
        <h3>Answers</h3>
        <Responses op={post} />
        <CodeBlock label="422 answer" code={JSON.stringify(examples.refused, null, 2)} />
      </section>

      <section id="get" className="dc-sec">
        <h2><span className="dc-verb dc-get">GET</span><code><Path p="/api/v1/leads/{number}" /></code></h2>
        <p className="dc-sum">{get.summary}. {get.description} The number goes in the path with dashes: <code>FW-26-00817</code>.</p>
        <CodeBlock label="200 answer" code={JSON.stringify(examples.lead817, null, 2)} />
        <h3>Answers</h3>
        <Responses op={get} />
      </section>

      <section id="slots" className="dc-sec">
        <h2><span className="dc-verb dc-get">GET</span><code><Path p="/api/v1/routes/{route}/slots" /></code></h2>
        <p className="dc-sum">{slots.summary}. {slots.description}</p>
        <p>Show the times in your visitor&rsquo;s own time zone. If someone took the picked time in between, sending the lead answers <code>409</code> and nothing is made.</p>
        <div className="dc-pair dc-pair-even">
          <CodeBlock label="200 answer" code={JSON.stringify(examples.slots, null, 2)} />
          <CodeBlock label="Then: a booking lead" code={JSON.stringify(examples.booking, null, 2)} />
        </div>
        <h3>Answers</h3>
        <Responses op={slots} />
      </section>

      <section id="scans" className="dc-sec">
        <h2>Scans</h2>
        <p>A lead&rsquo;s history, oldest first. Each scan says what happened, to which GHL step, on which try, with GHL&rsquo;s status.</p>
        <dl className="dc-states">
          {scanKinds.map((k) => <div key={k}><dt><code>{k}</code></dt><dd>{scanMeaning[k]}</dd></div>)}
        </dl>
      </section>
    </DocsFrame>
  );
}
