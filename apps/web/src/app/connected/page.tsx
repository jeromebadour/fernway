import Link from "next/link";
import "../not-found.css";
import { GCheck, GMark, GRoute } from "@/ui/glyphs";

// Where Connect GHL ends: what happened, in Fernway's words, and the way back.
const problems: Record<string, { title: string; text: string }> = {
  link: { title: "This connect link has expired.", text: "Connect links last 30 minutes. Make a new one and open it straight away." },
  expired: { title: "This connection attempt expired.", text: "Start again from the connect link, in the same browser, within 15 minutes." },
  declined: { title: "GHL wasn't connected.", text: "The approval in GHL was cancelled, so nothing was changed." },
  agency: { title: "That was an agency, not a sub-account.", text: "Fernway delivers into one sub-account. Start again and pick a sub-account in GHL." },
  refused: { title: "GHL didn't accept the connection.", text: "Nothing was saved. Start again from a new connect link." },
};

export default async function Connected({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const problem = q.problem ? (problems[q.problem] ?? problems.refused!) : null;
  return (
    <main className="nf">
      <Link className="nf-brand" href="/"><GMark size={26} /><span>FERNWAY</span></Link>
      <section className="nf-bill">
        <p className="nf-label">Connection</p>
        <p className="nf-no">{problem ? "GHL · not connected" : `GHL · ${q.location ?? ""}`}</p>
        <h1>{problem ? problem.title : "GHL is connected."}</h1>
        <p className="nf-text">
          {problem ? problem.text : `Sub-account ${q.location} approved ${q.scopes ?? "the"} permissions. New leads now travel straight into it.`}
        </p>
        <Link className="nf-go" href="/"><GRoute size={16} />Back to Fernway</Link>
        <div className={problem ? "nf-stamp" : "nf-stamp nf-stamp-ok"}>
          {problem ? "Not connected" : <><GCheck size={13} /> Connected</>}
        </div>
      </section>
    </main>
  );
}
