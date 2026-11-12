import type { Metadata } from "next";
import { RETRY_WAITS_MS } from "@fernway/core";
import { hookWords, SIGNATURE_TOLERANCE_S } from "@fernway/delivery";
import { appUrl } from "@/lib/api";
import { CodeBlock } from "@/ui/code-block";
import { DocsFrame } from "@/ui/docs-frame";
import { GManifest } from "@/ui/glyphs";

export const metadata: Metadata = { title: "Webhooks · Fernway", description: "Fernway's signed webhooks: the events, the body, checking the signature, and retries." };

const sections = [
  { id: "events", label: "Events" },
  { id: "body", label: "The body" },
  { id: "verify", label: "Checking the signature" },
  { id: "retries", label: "Answers and retries" },
];

const meaning: Record<string, string> = {
  "lead.picked_up": "Fernway took a lead in. It is on its way to GHL.",
  "lead.signed": "Every step of the lead is in GHL: contact, note, meeting, stage.",
  "lead.held": "GHL refused the lead for a reason waiting won't fix. The body says why; it waits for a fix and a resend.",
  "lead.returned": "GHL didn't answer in 8 tries over 24 hours.",
  "lead.scored": "Claude scored the lead (when the account turned lead score on).",
  "fernway.test": "Sent by Send a test in the console. Not about a lead.",
};

const node = `// Node 18+ with Express: read the body as it came, then check it.
import crypto from "node:crypto";
import express from "express";

const secret = process.env.FERNWAY_WEBHOOK_SECRET; // whsec_…, shown once in the console
const app = express();

app.post("/fernway", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("Fernway-Signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const body = req.body.toString("utf8");
  const want = crypto.createHmac("sha256", secret).update(\`\${parts.t}.\${body}\`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) <= ${SIGNATURE_TOLERANCE_S};
  const same = parts.v1?.length === want.length && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(want));
  if (!fresh || !same) return res.status(400).send("bad signature");

  const event = JSON.parse(body);          // { id, type, created, data }
  // Use event.id to drop a repeat: a retry sends the same id and the same body.
  res.status(200).json({ received: true }); // answer fast; do slow work after
});`;

const php = `<?php
// PHP 8 (Laravel, WordPress or plain): read the raw body, then check it.
$secret = getenv('FERNWAY_WEBHOOK_SECRET'); // whsec_…, shown once in the console
$body = file_get_contents('php://input');
parse_str(str_replace(',', '&', $_SERVER['HTTP_FERNWAY_SIGNATURE'] ?? ''), $parts);

$want = hash_hmac('sha256', ($parts['t'] ?? '') . '.' . $body, $secret);
$fresh = abs(time() - (int) ($parts['t'] ?? 0)) <= ${SIGNATURE_TOLERANCE_S};
if (!$fresh || !hash_equals($want, $parts['v1'] ?? '')) {
    http_response_code(400);
    exit('bad signature');
}

$event = json_decode($body, true); // ['id', 'type', 'created', 'data']
http_response_code(200);
echo json_encode(['received' => true]);`;

const mins = (ms: number) => (ms < 60_000 ? `${ms / 1000} s` : ms < 3_600_000 ? `${ms / 60_000} min` : `${ms / 3_600_000} h`);

export default function Webhooks() {
  const base = appUrl();
  const example = {
    id: "evt_3fJ9kQ0vLr2mXp7aZt1cWn8e", type: "lead.signed", created: "2026-11-12T14:03:11.402Z",
    data: {
      waybill: "FW 26 00817", state: "signed", route: { key: "trial", label: "Trial requests" }, source: "form",
      receipt: `${base}/track/eyJzIjo4MTd9.Qm2…`, reason: null,
      contact: { firstName: "Lena", lastName: "Hartmann", email: "lena@northpine-dental.com", phone: "+15035550142", companyName: "Northpine Dental", message: "We want to start this week." },
      ghl: { contactId: "ocwvFzhhiB7j0p9vyXK1", opportunityId: "1012v0E1Zo0iLqmzsfDN" },
      score: { score: 5, summary: "A dental group owner asking to start a trial this week.", signals: ["Asks to start now", "Work email domain"] },
      pickedUpAt: "2026-11-12T14:03:09.811Z", updatedAt: "2026-11-12T14:03:11.390Z",
    },
  };
  return (
    <DocsFrame current="/docs/webhooks" sections={sections}>
      <header className="dc-head">
        <p className="wb-eyebrow"><GManifest size={16} />Docs · Webhooks</p>
        <h1 className="fm-h1">Hear about your leads, signed.</h1>
        <p className="wb-sec-lede">Add an endpoint in the console under Webhooks, pick its events, and Fernway POSTs each one to it as JSON, signed with the endpoint&rsquo;s own secret. Endpoints must be <code>https</code> and public.</p>
      </header>

      <section id="events" className="dc-sec">
        <h2>Events</h2>
        <p>Each event reaches each endpoint once per lead. The <code>Fernway-Event</code> header names it, and so does the body&rsquo;s <code>type</code>.</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Event</th><th>In the console</th><th>Means</th></tr></thead>
          <tbody>{Object.keys(meaning).map((k, i) => <tr key={k}><td className="dc-num">{i + 1}</td><td><code>{k}</code></td><td>{hookWords[k as keyof typeof hookWords]}</td><td>{meaning[k]}</td></tr>)}</tbody>
        </table>
      </section>

      <section id="body" className="dc-sec">
        <h2>The body</h2>
        <p>The lead as Fernway saw it when it noted the event, within seconds of it (a lead signed for in a second can already read <code>signed</code> in its <code>lead.picked_up</code>). <code>score</code> is <code>null</code> until the lead is scored; <code>reason</code> is GHL&rsquo;s words when a lead is held; <code>contact</code> holds only the fields the lead came with.</p>
        <CodeBlock label="POST to your endpoint" code={JSON.stringify(example, null, 2)} />
        <CodeBlock label="Headers" code={"Content-Type: application/json\nFernway-Event: lead.signed\nFernway-Delivery: evt_3fJ9kQ0vLr2mXp7aZt1cWn8e\nFernway-Signature: t=1794491791,v1=5b0c1e…\nUser-Agent: Fernway-Webhooks/1"} />
      </section>

      <section id="verify" className="dc-sec">
        <h2>Checking the signature</h2>
        <p><code>Fernway-Signature</code> is <code>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, where the hex is HMAC-SHA256 of <code>&lt;t&gt;.&lt;the body as sent&gt;</code> with your secret. Check it against the raw body (before any JSON parsing), compare in constant time, and refuse a time more than {SIGNATURE_TOLERANCE_S / 60} minutes away from yours, so an old call can&rsquo;t be played again.</p>
        <CodeBlock label="Node" code={node} />
        <CodeBlock label="PHP" code={php} />
      </section>

      <section id="retries" className="dc-sec">
        <h2>Answers and retries</h2>
        <p>Answer any <code>2xx</code> within 10 seconds and the delivery is done. Anything else (or no answer) is tried again on the same clock as a lead, with the same id and the same bytes, so you can drop a repeat by its <code>id</code>:</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Try</th><th>After the one before</th></tr></thead>
          <tbody>{RETRY_WAITS_MS.map((ms, i) => <tr key={i}><td className="dc-num">{i + 1}</td><td>Try {i + 2}</td><td>{mins(ms)}</td></tr>)}</tbody>
        </table>
        <p className="dc-small">After the last try the delivery shows as failed in the console, with what your endpoint answered, and Resend sends it again. Deliveries are kept 30 days.</p>
      </section>
    </DocsFrame>
  );
}
