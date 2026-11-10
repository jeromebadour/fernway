import { randomBytes } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { PER_KEY_MINUTE } from "@/lib/api";
import { appUrl } from "@/lib/api";
import { DOCS_ROUTE, publicDocsKey } from "@/lib/docs-key";
import { CodeBlock } from "@/ui/code-block";
import { DocsFrame } from "@/ui/docs-frame";
import { GBrackets, GHold, GKey, GManifest } from "@/ui/glyphs";
import { TryIt } from "@/ui/try-it";

export const metadata: Metadata = { title: "Docs · Fernway", description: "Send your first lead into GoHighLevel with one request, and track it." };
export const dynamic = "force-dynamic";

const sections = [
  { id: "key", label: "1. The key" },
  { id: "send", label: "2. Send a lead" },
  { id: "track", label: "3. Track it" },
  { id: "again", label: "4. Sending twice is safe" },
  { id: "wrong", label: "When something's wrong" },
];

const states = [
  ["picked_up", "Fernway has it and has checked it."],
  ["in_transit", "Being handed to GHL right now."],
  ["waiting", "GHL was busy or down; the next try is scheduled. 8 tries over 24 hours."],
  ["signed", "GHL has it: the contact, its note, and its opportunity or meeting."],
  ["held", "GHL refused it for a reason a retry can't fix. Its reason is on the lead."],
] as const;

export default async function Docs() {
  const key = await publicDocsKey();
  const shownKey = key ?? "fw_your_key";
  // A key of its own for each visit, so two visitors trying the docs never share a waybill.
  const body = {
    idempotencyKey: `docs-${randomBytes(6).toString("hex")}`,
    route: DOCS_ROUTE,
    contact: { firstName: "Ada", email: "ada@example.com" },
  };
  const base = appUrl();
  const send = `curl ${base}/api/v1/leads \\
  -H "Authorization: Bearer ${shownKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}'`;
  const track = `curl ${base}/api/v1/leads/FW-26-00817 \\
  -H "Authorization: Bearer ${shownKey}"`;

  return (
    <DocsFrame current="/docs" sections={sections}>
      <header className="dc-head">
        <p className="wb-eyebrow"><GManifest size={16} />Docs · Quick start</p>
        <h1 className="fm-h1">Your first lead, in one request.</h1>
        <p className="wb-sec-lede">Send a lead to Fernway and it lands in GoHighLevel as a contact, with its note and its opportunity. You get a waybill number back, and every step it takes is a scan you can read.</p>
      </header>

      <section id="key" className="dc-sec">
        <h2><span className="dc-n">1</span>The key</h2>
        <p>Every request carries an API key in its <code>Authorization</code> header. This one is public, so you can run everything on this page now.</p>
        {key ? <CodeBlock label="Demo key" code={key} /> : <p className="dc-callout"><GHold size={16} />The demo key is being set up. Until then the examples show where your key goes.</p>}
        <p className="dc-callout dc-callout-go"><GKey size={16} /><span>The demo key reaches only the demo account. Its leads go to a stand-in GHL inside Fernway, not a real CRM, and are deleted after a day. A real account gets its own keys, shown once and stored only as a hash.</span></p>
      </section>

      <section id="send" className="dc-sec">
        <h2><span className="dc-n">2</span>Send a lead</h2>
        <p>Post the person and the route it takes. The route decides the pipeline, stage and tags in GHL. An email or a phone number is required, so GHL can keep one person as one contact.</p>
        <div className="dc-stack">
          <CodeBlock label="Terminal" code={send} />
          {key ? <TryIt apiKey={key} body={body} /> : null}
        </div>
        <p>The answer comes at once, before GHL is reached: <code>201</code> with the waybill number, the lead&rsquo;s API link and a receipt page you can hand to the person who sent it. Delivery into GHL follows, usually within seconds.</p>
      </section>

      <section id="track" className="dc-sec">
        <h2><span className="dc-n">3</span>Track it</h2>
        <p>Ask for the lead by its number, with dashes. You get where it is and every scan so far.</p>
        <CodeBlock label="Terminal" code={track} />
        <dl className="dc-states">
          {states.map(([s, d]) => <div key={s}><dt><code className={`dc-st dc-st-${s}`}>{s}</code></dt><dd>{d}</dd></div>)}
        </dl>
      </section>

      <section id="again" className="dc-sec">
        <h2><span className="dc-n">4</span>Sending twice is safe</h2>
        <p>The <code>idempotencyKey</code> is your own id for the lead: an order number, a form entry id, anything that stays the same for the same lead. Sent again, after a timeout or a crash, it gives the same waybill back with <code>&quot;duplicate&quot;: true</code>, and nothing reaches GHL twice. A send that may have failed is always safe to repeat.</p>
      </section>

      <section id="wrong" className="dc-sec">
        <h2>When something&rsquo;s wrong</h2>
        <p>Every refusal says what to change, one line per problem, the field first. Nothing is made when a lead is refused.</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Status</th><th>Means</th><th>Good to know</th></tr></thead>
          <tbody>
            <tr><td className="dc-num">1</td><td><code className="dc-no">401</code></td><td>No key, or a revoked one.</td><td>The key travels in the <code>Authorization</code> header.</td></tr>
            <tr><td className="dc-num">2</td><td><code className="dc-no">422</code></td><td>The lead was refused at the door.</td><td>Each problem names its field and what the field needs.</td></tr>
            <tr><td className="dc-num">3</td><td><code className="dc-no">429</code></td><td>Over the limit: {PER_KEY_MINUTE} requests a minute per key.</td><td><code>Retry-After</code> gives the wait in seconds; the same key sends nothing twice.</td></tr>
          </tbody>
        </table>
        <CodeBlock label="422 answer" code={JSON.stringify({ ok: false, problems: ["contact.email: a real email address"] }, null, 2)} />
        <p className="dc-next">Every field, every answer: <Link href="/docs/api"><GBrackets size={15} />the API reference</Link>.</p>
      </section>
    </DocsFrame>
  );
}
