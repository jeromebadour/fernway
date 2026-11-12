import type { Metadata } from "next";
import { formByKey, siteAllowed } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { GMark, GWidget } from "@/ui/glyphs";
import { EmbedForm } from "./form";
import "@/ui/forms.css";
import "./embed.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fernway form" };

// A Fernway embed form, as shown inside a customer's page (embed.js frames it) or opened from the console's Preview.
// The form's own owner decides its fields, look and the sites allowed to show it; browsers enforce the sites through
// the frame-ancestors header (src/proxy.ts), and this page says so too when the page it sits on isn't one of them.
export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ site?: string; preview?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const form = await formByKey(delivery().db, key);
  const site = sp.site?.toLowerCase().slice(0, 253) ?? null;
  const theme = form?.theme ?? "light";
  const closed = !form ? "This form is closed." : sp.preview ? null : site && !siteAllowed(form.sites, site) ? "This form isn't open on this site." : null;
  return (
    <main className={`em em-${theme}`} data-key={key}>
      {closed || !form ? (
        <p className="em-closed"><GWidget size={18} />{closed}</p>
      ) : (
        <>
          {sp.preview && <p className="em-preview"><GWidget size={15} /><span><b>Preview.</b> This is the form as your visitors see it. A lead sent from here is real and travels its route.</span></p>}
          <EmbedForm formKey={key} fields={form.fields} button={form.button} />
        </>
      )}
      <a className="em-by" href="https://fernway.jeromebadour.com" target="_blank" rel="noopener"><GMark size={14} />Delivered by Fernway</a>
    </main>
  );
}
