import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/ui/code-block";
import { DocsFrame } from "@/ui/docs-frame";
import { GBlocks, GCalendar, GDown, GKey, GOut, GShield, GWidget } from "@/ui/glyphs";
import zip from "@/ui/plugin-zip.json";

export const metadata: Metadata = {
  title: "WordPress · Fernway",
  description: "Fernway for WordPress: a form block and an Elementor widget that deliver a site's leads into GoHighLevel, with a receipt for every one.",
};

const DEMO = "https://alderpike.jeromebadour.com";
const FILE = "/downloads/fernway-for-wordpress.zip";

const sections = [
  { id: "get", label: "Get the plugin" },
  { id: "connect", label: "Connect it" },
  { id: "form", label: "Add the form" },
  { id: "booking", label: "Booking forms" },
  { id: "visitors", label: "What visitors get" },
  { id: "log", label: "The log" },
  { id: "example", label: "A site running it" },
];

const fields: [string, string][] = [
  ["address", "House or business address. Sent to GHL's own address fields; the ZIP is checked against the service area."],
  ["name", "First and last name, split for GHL."],
  ["phone", "Checked as it's typed; sent in international form."],
  ["email", "Checked for typos; GHL matches the contact on it."],
  ["company", "The business name."],
  ["slot", "A day and a morning or afternoon, from the route's GHL calendar (booking routes only)."],
  ["message", "Free text, added to the contact as a note."],
];

const block = `<!-- wp:fernway/form {
  "route": "roof-check",
  "fields": ["address", "name", "phone", "email", "slot", "message"],
  "title": "Free roof check",
  "submitLabel": "Book my check",
  "labels": { "address": "House address", "email": "Email, for the report" }
} /-->`;

const theme = `/* In your theme's style.css: the form takes your site's look. */
.fernway {
  --fw-surface: #f4f2ec;   /* the card */
  --fw-ink: #1b1f22;       /* text and lines */
  --fw-accent: #ee6a1f;    /* the button */
  --fw-accent-ink: #1b1f22;
  --fw-radius: 0;
  --fw-font: "Archivo", sans-serif;
}`;

const settings: [string, string][] = [
  ["API key", "Made in the console under API keys, for Fernway for WordPress (every plan); shown once. The field never shows a saved key back."],
  ["Route", "Where a form's leads go in GHL, unless the form names its own."],
  ["Country", "Two letters. Phone numbers without a country code, and addresses, are read as this country's."],
  ["Service area", "ZIP codes or their first digits. An address outside is still sent; the form says you'll confirm."],
  ["Hours offered", "For booking forms, in the site's time zone, like 8-16. No time outside is offered, or accepted."],
];

// Each outcome in the docs' own colours: delivered green, refused amber, try again periwinkle.
const outcomes: [string, string, string, "signed" | "held" | "waiting"][] = [
  ["Sent", "201", "A new lead, with its waybill number.", "signed"],
  ["Sent before", "200", "The same send again (a double click, a retry): the same waybill, nothing twice.", "signed"],
  ["Refused", "422", "A field Fernway wouldn't take, in its own words.", "held"],
  ["Time taken", "409", "Someone booked that time first. The visitor picks again.", "waiting"],
  ["Too many", "", "Six sends an hour from one visitor; the plugin stops the seventh before it leaves the site.", "held"],
  ["Not reached", "5xx", "Fernway didn't answer. The visitor is told nothing was lost on their side and to try again in a minute.", "waiting"],
];

export default function WordPress() {
  const mb = (zip.bytes / 1024).toFixed(0);
  return (
    <DocsFrame current="/docs/wordpress" sections={sections}>
      <header className="dc-head">
        <p className="wb-eyebrow"><GBlocks size={16} />Docs · WordPress</p>
        <h1 className="fm-h1">Your WordPress forms, delivered.</h1>
        <p className="wb-sec-lede">Fernway for WordPress puts a Fernway form on any page, as a block or an Elementor widget. Each send becomes a lead in GoHighLevel, and the visitor gets the receipt that shows it arriving.</p>
      </header>

      <section id="get" className="dc-sec">
        <h2><span className="dc-n">1</span>Get the plugin</h2>
        <p>Download the zip, then in WordPress go to Plugins, Add New, Upload Plugin, and activate it. It needs WordPress 6.7 or later and PHP 8.1 or later; nothing else.</p>
        <div className="dc-dl">
          <a className="wb-go" href={FILE} download><GDown size={16} />Fernway for WordPress {zip.version}</a>
          <dl>
            <div><dt>Files</dt><dd>{zip.files}, {mb} KB</dd></div>
            <div><dt>SHA-256</dt><dd className="dc-sha">{zip.sha256.match(/.{1,16}/g)!.join(" ")}</dd></div>
          </dl>
        </div>
        <p className="dc-small">Built from <a href="https://github.com/jeromebadour/fernway/tree/main/integrations/wordpress/plugin/fernway">the public code</a> by the same build that ships Fernway, so the zip is always the version its tests ran on.</p>
      </section>

      <section id="connect" className="dc-sec">
        <h2><span className="dc-n">2</span>Connect it</h2>
        <p>In the console, make an API key for Fernway for WordPress: it works on every plan, and its leads always show as from WordPress. In WordPress, open Settings, Fernway. Paste the key, name the route, and press Test connection: it checks the key with Fernway, and for a booking route, counts the free times in its GHL calendar.</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Setting</th><th>What it does</th></tr></thead>
          <tbody>{settings.map(([k, v], i) => <tr key={k}><td className="dc-num">{i + 1}</td><td>{k}</td><td>{v}</td></tr>)}</tbody>
        </table>
        <p className="dc-callout dc-callout-go"><GKey size={16} /><span>Give each site its own key, so one site can be turned off in the console without touching the others. A key is kept in WordPress&rsquo;s database and never sent to a visitor&rsquo;s browser.</span></p>
      </section>

      <section id="form" className="dc-sec">
        <h2><span className="dc-n">3</span>Add the form</h2>
        <p><b>In the block editor:</b> add the block <i>Fernway form</i> and pick its fields, route and words in the sidebar. <b>In Elementor:</b> drag in the widget <i>Fernway form</i>; its Style tab sets the colours and corners. Both draw the same form.</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Field</th><th>Sent as</th></tr></thead>
          <tbody>{fields.map(([k, v], i) => <tr key={k}><td className="dc-num">{i + 1}</td><td><code>{k}</code></td><td>{v}</td></tr>)}</tbody>
        </table>
        <CodeBlock label="The block, as it sits in a page or a theme pattern" code={block} />
        <p>A theme sets the form&rsquo;s look with a few CSS variables, so it fits the site instead of looking added on:</p>
        <CodeBlock label="Theme CSS" code={theme} />
      </section>

      <section id="booking" className="dc-sec">
        <h2><span className="dc-n">4</span>Booking forms</h2>
        <p>Give a route a GHL calendar in the console and its form offers the next five working days, each with a morning and an afternoon, read from that calendar a minute old at most. The visitor picks a half day; Fernway books the first free time in it, checked again at sending, and the receipt says when.</p>
        <p className="dc-callout"><GCalendar size={16} /><span>Hours offered keeps the form inside working hours, whatever the calendar allows: <code>8-16</code> offers times from 8:00 and none starting at 4:00 or later, in the site&rsquo;s own time zone. A time from outside is refused by the server too, not only hidden.</span></p>
      </section>

      <section id="visitors" className="dc-sec">
        <h2><span className="dc-n">5</span>What visitors get</h2>
        <p>After sending, the form gives way to the receipt: the waybill number and each scan as it happens, picked up to signed for, usually within two or three seconds. It can be copied as a link, opened again for 30 days, and added to a calendar for a booking.</p>
        <ul className="dc-list">
          <li><GShield size={15} /><span><b>Works without JavaScript.</b> The form posts to WordPress, which sends it and draws the receipt itself.</span></li>
          <li><GShield size={15} /><span><b>Safe behind a page cache.</b> Each opened form gets its own key in the browser, so a cached page never sends someone else&rsquo;s lead, and a double click sends once.</span></li>
          <li><GShield size={15} /><span><b>Only the sender sees a receipt.</b> The site signs each number when it sends it, and draws a receipt only for a signed one.</span></li>
        </ul>
      </section>

      <section id="log" className="dc-sec">
        <h2><span className="dc-n">6</span>The log</h2>
        <p>Settings, Fernway lists the last 50 sends from the site, kept 30 days: when, which route, the outcome and the waybill number. No name, email or phone is kept in it; the lead itself is in Fernway and GHL.</p>
        <table className="dc-table">
          <thead><tr><th className="dc-num">#</th><th>Logged</th><th>Answer</th><th>Means</th></tr></thead>
          <tbody>{outcomes.map(([k, c, v, tone], i) => (
            <tr key={k}>
              <td className="dc-num">{i + 1}</td>
              <td className={`dc-tone-${tone} dc-nowrap`}>{k}</td>
              <td>{c ? <code className={`dc-st dc-st-${tone}`}>{c}</code> : <span className="dc-dash">&ndash;</span>}</td>
              <td>{v}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section id="example" className="dc-sec">
        <h2>A site running it</h2>
        <p><a href={DEMO}>Alder &amp; Pike Roofing</a> is an invented Tacoma roofer, on a block theme made from scratch, with Fernway for WordPress on every page. Its booking form sends real leads into Fernway&rsquo;s test GoHighLevel account.</p>
        <div className="dc-try-do">
          <a className="wb-ghost" href={`${DEMO}/roof-check/`}><GCalendar size={16} />Book a roof check<GOut size={13} /></a>
          <a className="wb-ghost" href="https://github.com/jeromebadour/fernway/tree/main/integrations/wordpress"><GWidget size={16} />The theme and plugin code<GOut size={13} /></a>
        </div>
        <p className="dc-next">Sending from your own code instead: <Link href="/docs">the quick start</Link>.</p>
      </section>
    </DocsFrame>
  );
}
