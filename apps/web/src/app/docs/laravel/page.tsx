import type { Metadata } from "next";
import Link from "next/link";
import { SIGNATURE_TOLERANCE_S } from "@fernway/delivery";
import { CodeBlock } from "@/ui/code-block";
import { DocsFrame } from "@/ui/docs-frame";
import { GKey, GOut, GPackage, GShield, GSignal, GWidget } from "@/ui/glyphs";

export const metadata: Metadata = {
  title: "Laravel · Fernway",
  description: "Fernway for Laravel: send your app's leads into GoHighLevel with retries that never send twice, and hear back through signed webhooks as Laravel events.",
};

const REPO = "https://github.com/jeromebadour/fernway/tree/main/integrations/laravel";

const sections = [
  { id: "install", label: "Install" },
  { id: "send", label: "Send a lead" },
  { id: "retries", label: "Retries" },
  { id: "booking", label: "Booking routes" },
  { id: "hear", label: "Hear back" },
  { id: "proof", label: "How it's tested" },
];

const install = `composer require jeromebadour/fernway-laravel`;

const env = `FERNWAY_KEY=fw_...                 # the console, API keys (shown once)
FERNWAY_ROUTE=callback             # the route a lead takes when it names none
FERNWAY_WEBHOOK_SECRET=whsec_...   # the console, Webhooks (shown once); leave out to receive none`;

const check = `php artisan fernway:test roof-check

   INFO  Fernway accepted the API key (https://fernway.jeromebadour.com).
   INFO  Route roof-check books meetings: 160 free times in the next 14 days.
  Webhooks .............................. https://your-app.com/fernway/webhook`;

const send = `use Fernway\\Laravel\\Facades\\Fernway;
use Fernway\\Laravel\\Lead;

$lead = Lead::to('callback')
    ->key("order-{$order->id}")     // your own id: the same lead sent again is never a second one
    ->name('Dana', 'Whitfield')
    ->email('dana@example.com')
    ->phone('+1 253 555 0142')
    ->company('Northpine Dental')
    ->message('Call me after 4pm');

Fernway::send($lead);              // queued: LeadSent or LeadRefused follows
$sent = Fernway::sendNow($lead);   // or now: $sent->number, $sent->receipt`;

const booking = `$times = Fernway::slots('roof-check');   // free start times, UTC, the next 14 days

Fernway::send(
    Lead::to('roof-check')
        ->name('Dana', 'Whitfield')
        ->phone('+1 253 555 0142')
        ->address('14 Cedar Ln', 'Tacoma', 'WA', '98406', 'US')
        ->at($request->input('slot'))   // one of $times, as it came
);`;

const listen = `use Fernway\\Laravel\\Events\\LeadHeld;
use Fernway\\Laravel\\Events\\LeadSent;
use Fernway\\Laravel\\Events\\LeadSignedFor;

Event::listen(fn (LeadSent $e) => $e->lead->idempotencyKey());        // and $e->sent->number
Event::listen(fn (LeadSignedFor $e) => Order::where('waybill', $e->waybill())->update(['in_crm' => true]));
Event::listen(fn (LeadHeld $e) => Log::warning("GHL held {$e->waybill()}: {$e->reason()}"));`;

const events: [string, string, string][] = [
  ["LeadSent", "Your queue", "Fernway took a queued lead: its waybill number and receipt."],
  ["LeadRefused", "Your queue", "Fernway refused it; never retried. Its reasons, the field first."],
  ["LeadNotSent", "Your queue", "Out of tries, or the key was refused. Sending it again later is safe."],
  ["LeadPickedUp", "lead.picked_up", "Fernway took a lead in; it is on its way to GHL."],
  ["LeadSignedFor", "lead.signed", "Every step is in GHL: contact, note, meeting, stage."],
  ["LeadHeld", "lead.held", "GHL refused it for a reason waiting won't fix: reason() says why."],
  ["LeadReturned", "lead.returned", "GHL didn't answer in 8 tries over 24 hours."],
  ["LeadScored", "lead.scored", "Claude scored it: score() is 1 to 5."],
];

const waits = [10, 30, 120, 600, 1800, 3600];
const human = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);

export default function Laravel() {
  return (
    <DocsFrame current="/docs/laravel" sections={sections}>
      <header className="dc-head">
        <p className="wb-eyebrow"><GPackage size={16} />Docs · Laravel</p>
        <h1 className="fm-h1">Your Laravel app&rsquo;s leads, delivered.</h1>
        <p className="wb-sec-lede">Fernway for Laravel sends leads from your queue into GoHighLevel through Fernway, retries without ever sending twice, and turns Fernway&rsquo;s signed webhooks into ordinary Laravel events. Laravel 12 and 13, PHP 8.2 or later.</p>
      </header>

      <section id="install" className="dc-sec">
        <h2><span className="dc-n">1</span>Install</h2>
        <CodeBlock label="Terminal" code={install} />
        <p>Add a key from the console (API keys) and, to hear back, a webhook endpoint&rsquo;s secret (Webhooks), then check the connection. It sends nothing.</p>
        <CodeBlock label=".env" code={env} />
        <CodeBlock label="Terminal" code={check} />
        <p className="dc-callout dc-callout-go"><GKey size={16} /><span>Give each app its own key, so one can be turned off in the console without touching the others. The key stays in your <code>.env</code>; the package never logs it.</span></p>
      </section>

      <section id="send" className="dc-sec">
        <h2><span className="dc-n">2</span>Send a lead</h2>
        <p>A lead gets its own idempotency key the moment it is made, or yours if you give one. Every try carries it, so Fernway delivers it once however many times it arrives. An email or a phone number is required, so GHL keeps one person as one contact.</p>
        <CodeBlock label="PHP" code={send} />
      </section>

      <section id="retries" className="dc-sec">
        <h2><span className="dc-n">3</span>Retries</h2>
        <p>On the queue, a lead Fernway couldn&rsquo;t take this time is tried again on this back-off; a <code>429</code> waits as long as Fernway asks. A refusal (a bad field, a time just taken) is never retried: <code>LeadRefused</code> says why. A refused key fails at once instead of seven times.</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Try</th><th>After the one before</th></tr></thead>
          <tbody>{waits.map((s, i) => <tr key={i}><td className="dc-num">{i + 1}</td><td>Try {i + 2}</td><td>{human(s)}</td></tr>)}</tbody>
        </table>
        <p className="dc-small">These are your app&rsquo;s tries to reach Fernway. Once Fernway has the lead, its own clock takes over: up to 8 tries into GHL over 24 hours, as on <Link href="/delivery">How delivery works</Link>.</p>
      </section>

      <section id="booking" className="dc-sec">
        <h2><span className="dc-n">4</span>Booking routes</h2>
        <p>A route with a GHL calendar books a meeting. Show the free times from <code>Fernway::slots()</code>, send the one picked back with <code>at()</code>; Fernway checks it again on arrival, and a time someone took in between is a refusal with its reason.</p>
        <CodeBlock label="PHP" code={booking} />
      </section>

      <section id="hear" className="dc-sec">
        <h2><span className="dc-n">5</span>Hear back</h2>
        <p>Point an endpoint in the console at <code>https://your-app.com/fernway/webhook</code>. Each delivery is checked before it becomes an event: an HMAC-SHA256 of the raw body with the endpoint&rsquo;s secret, compared in constant time, its time within {SIGNATURE_TOLERANCE_S / 60} minutes. A forged or replayed call gets a <code>400</code>; a retry of the same delivery fires once; if your own listener throws, Fernway&rsquo;s retry runs it again. With no secret set, the route doesn&rsquo;t exist.</p>
        <CodeBlock label="PHP" code={listen} />
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Laravel event</th><th>From</th><th>Means</th></tr></thead>
          <tbody>{events.map(([e, from, v], i) => <tr key={e}><td className="dc-num">{i + 1}</td><td><code>{e}</code></td><td>{from.includes(".") ? <code>{from}</code> : from}</td><td>{v}</td></tr>)}</tbody>
        </table>
        <p className="dc-next">The bodies and the signature in full: <Link href="/docs/webhooks"><GSignal size={15} />Webhooks</Link>.</p>
      </section>

      <section id="proof" className="dc-sec">
        <h2>How it&rsquo;s tested</h2>
        <ul className="dc-list">
          <li><GShield size={15} /><span><b>Its own tests, twice.</b> On PHP 8.2 with Laravel 12 and on PHP 8.4 with Laravel 13: every answer Fernway can give, the queue&rsquo;s retries, one key for every try, signatures right and wrong.</span></li>
          <li><GShield size={15} /><span><b>A fresh Laravel app, end to end.</b> Fernway&rsquo;s CI installs the package into a new Laravel 13 app, which sends real leads through Fernway into a stand-in GoHighLevel and receives Fernway&rsquo;s signed webhooks back.</span></li>
        </ul>
        <div className="dc-try-do">
          <a className="wb-ghost" href={REPO}><GWidget size={16} />The package&rsquo;s code<GOut size={13} /></a>
        </div>
        <p className="dc-next">Sending from other code: <Link href="/docs">the quick start</Link>.</p>
      </section>
    </DocsFrame>
  );
}
