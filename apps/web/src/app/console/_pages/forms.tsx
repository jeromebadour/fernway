import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { Ago } from "@/ui/ago";
import { GEye, GGlobe, GRoute, GWidget } from "@/ui/glyphs";
import { FormEdit, FormMake, FormRevoke, Snippet, type FormDraft } from "../forms/editor";

export const fieldWords: Record<string, string> = { firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", companyName: "Company", message: "Message" };
const themeWords: Record<string, string> = { light: "Light", dark: "Dark", auto: "Follows the visitor" };

// Embed forms: a Fernway form for any website or GHL funnel, put in with one line of code. Each card is one form with
// its code to copy, where its leads go, what it asks, where it may be shown, and what it sent in the last 30 days.
export async function Forms({ who }: { who: ConsoleWho }) {
  const [forms, routes] = await Promise.all([who.data.forms(), who.data.routes()]);
  const can = who.role !== "member";
  // A form can't book a meeting (it has no time picker), so routes with a calendar are left out of its choices.
  const usable = routes.filter((r) => !r.calendarId).map((r) => ({ key: r.key, label: r.label }));
  const app = process.env.APP_URL?.replace(/\/$/, "") ?? "https://fernway.jeromebadour.com";

  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GWidget size={16} />Embed forms</p>
          <h1 className="ac-h1">Your form, on any site.</h1>
        </div>
        {can && <FormMake routes={usable} />}
      </header>
      <p className="rt-lede">One line of code puts a Fernway form on your website or in a GHL funnel. Each lead it takes travels the route you pick, and the visitor gets their own receipt.</p>

      <ol className="rt-list">
        {forms.map((f) => {
          const draft: FormDraft = { id: f.id, label: f.label, routeKey: f.routeKey, fields: f.fields, theme: f.theme, button: f.button, sites: f.sites };
          return (
            <li key={f.id} id={`form-${f.id}`} className="rt-card ef-card">
              <div className="rt-head">
                <code className="rt-key">{f.key}</code>
                <h2 className="rt-name">{f.label}</h2>
                {can && <span className="ef-do"><FormEdit form={draft} routes={usable} /><FormRevoke id={f.id} label={f.label} /></span>}
              </div>
              <dl className="ef-facts">
                <div><dt><GRoute size={13} />Route</dt><dd><Link href={`${who.base}/routes#route-${f.routeKey}`}><code>{f.routeKey}</code></Link>{f.routeLabel ? ` ${f.routeLabel}` : <em className="cn-hz"> no longer a route</em>}</dd></div>
                <div><dt><GWidget size={13} />Asks for</dt><dd className="ef-chips">{f.fields.map((x) => <span key={x} className="rt-tag">{fieldWords[x]}</span>)}</dd></div>
                <div><dt><GEye size={13} />Look</dt><dd>{themeWords[f.theme]} · button &ldquo;{f.button}&rdquo;</dd></div>
                <div><dt><GGlobe size={13} />Shown on</dt><dd>{f.sites.length ? f.sites.map((s) => <code key={s} className="ef-site">{s}</code>) : "Any site"}</dd></div>
              </dl>
              <Snippet app={app} formKey={f.key} />
              <dl className="rt-facts">
                <div><dt>Last 30 days</dt><dd>{f.leads30.toLocaleString("en-US")} {f.leads30 === 1 ? "lead" : "leads"}</dd></div>
                <div><dt>Last lead</dt><dd>{f.lastLeadAt ? <Ago iso={f.lastLeadAt} /> : "None yet"}</dd></div>
                <div><dt>Made by</dt><dd>{f.madeBy}</dd></div>
                <div><dt>Made</dt><dd><Ago iso={f.createdAt} /></dd></div>
              </dl>
            </li>
          );
        })}
      </ol>
      {forms.length === 0 && <p className="bl-empty"><GWidget size={16} />No embed forms yet.{can ? " Make one, copy its code, and paste it where the form should appear." : ""}</p>}
    </>
  );
}
