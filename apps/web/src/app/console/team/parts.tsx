"use client";
// The team table and its changes: invite (a dialog), change a role (the owner), remove someone and cancel an invite
// (each asks first, 2.20). Every change reads the page again, so the table is always what the server has.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Ago } from "@/ui/ago";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { Field } from "@/ui/field";
import { GCheck, GClock, GClose, GLock, GMail, GShield, GSignUp, GTrash, GUser } from "@/ui/glyphs";

type Role = "owner" | "admin" | "member";
type Member = { userId: number; name: string; email: string; role: Role; joined: string; lastSeenAt: string | null; twoStep: boolean };
type Invite = { id: number; email: string; role: "admin" | "member"; by: string | null; sentAt: string; expires: string };
type Ask = { title: string; text: React.ReactNode; go: string; path: string; body: object; G: (p: { size?: number }) => React.ReactNode };

const roleWords: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const roleLine: Record<Role, string> = {
  owner: "Everything, billing and deleting the account included",
  admin: "Routes, GHL, keys and inviting members",
  member: "Sees every lead and resends held ones",
};
const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then((r) => r.json()).catch(() => ({ ok: false, problems: ["form: Fernway could not be reached"] })) as Promise<{ ok?: boolean; emailSent?: boolean; problems?: string[] }>;
const words = (p?: string[]) => (p?.[0] ?? "form: not done").replace(/^[a-zA-Z]+: /, "").replace(/^./, (c) => c.toUpperCase());

export function Team({ me, max, members, invites }: { me: { userId: number; role: Role }; max: number; members: Member[]; invites: Invite[] }) {
  const router = useRouter();
  const inviteD = useRef<HTMLDialogElement>(null);
  const askD = useRef<HTMLDialogElement>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [n, setN] = useState(0);
  const [roleBusy, setRoleBusy] = useState<number | null>(null);
  const [roleProblem, setRoleProblem] = useState<string | null>(null);
  const can = me.role !== "member";
  const demo = useDemo();
  const [roleSaid, setRoleSaid] = useState<string | null>(null);
  const mayRemove = (x: Member) => x.userId !== me.userId && x.role !== "owner" && (me.role === "owner" || (me.role === "admin" && x.role === "member"));
  const open = (a: Ask) => { setAsk(a); requestAnimationFrame(() => askD.current?.showModal()); };

  async function role(x: Member, to: Role) {
    if (demo) { setRoleSaid(`${x.name} is now ${to === "admin" ? "an admin" : "a member"}, and the audit log says who changed it.`); return; }
    setRoleBusy(x.userId); setRoleProblem(null);
    const r = await post("/api/console/team/role", { userId: x.userId, role: to });
    setRoleBusy(null);
    if (r.ok) router.refresh(); else setRoleProblem(words(r.problems));
  }

  return (
    <>
      <div className="dv-bar">
        <p className="dv-count"><b>{members.length}</b>{members.length === 1 ? "person" : "people"}<em>{invites.length ? `and ${invites.length} invited, ` : ""}of {max}</em></p>
        {can && <button type="button" className="wb-go fm-btn" disabled={members.length + invites.length >= max}
          onClick={() => { setN((k) => k + 1); requestAnimationFrame(() => inviteD.current?.showModal()); }}><GSignUp size={16} />Invite someone</button>}
      </div>
      {roleProblem && <p className="fm-error" role="alert">{roleProblem}</p>}
      {roleSaid && <DemoSaid what={roleSaid} />}

      <table className="bl-table tm-table">
        <thead><tr><th>Person</th><th>Role</th><th>Two-step</th><th>Joined</th><th>Last seen</th><th><span className="bl-sr">Remove</span></th></tr></thead>
        <tbody>
          {members.map((x) => (
            <tr key={x.userId}>
              <td><span className="tm-who">
                <span className="wb-ava tm-ava">{x.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span><b>{x.name}{x.userId === me.userId && <i className="tm-you">you</i>}</b><em>{x.email}</em></span>
              </span></td>
              <td className="tm-role">
                {me.role === "owner" && x.role !== "owner" ? (
                  <span className="fm-input fm-has-g tm-select">
                    <span className="fm-g" aria-hidden="true">{roleBusy === x.userId ? <GClock size={14} /> : <GShield size={14} />}</span>
                    <span className="ac-select"><select aria-label={`Role of ${x.name}`} value={x.role} disabled={roleBusy !== null} onChange={(e) => role(x, e.target.value as Role)}>
                      <option value="admin">Admin</option><option value="member">Member</option>
                    </select></span>
                  </span>
                ) : <span className={`tm-badge tm-${x.role}`}><GShield size={13} />{roleWords[x.role]}</span>}
                <em>{roleLine[x.role]}</em>
              </td>
              <td>{x.twoStep ? <span className="bl-chip bl-chip-ok"><GLock size={13} />On</span> : <span className="tm-off">Off</span>}</td>
              <td className="cn-mono">{x.joined}</td>
              <td>{x.lastSeenAt ? <Ago iso={x.lastSeenAt} /> : <span className="tm-off">Not yet</span>}</td>
              <td className="bl-links">{can && mayRemove(x) && (
                <button type="button" className="ky-revoke" onClick={() => open({
                  title: `Remove ${x.name}?`, G: GTrash, go: "Remove", path: "/api/console/team/remove", body: { userId: x.userId },
                  text: <>{x.name} is signed out everywhere at once and can&apos;t sign in again. What they did stays in the audit log. Inviting {x.email} again later is fine.</>,
                })}><GTrash size={14} />Remove</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="tm-invites" aria-labelledby="tm-inv-h">
        <h2 id="tm-inv-h" className="bl-h2"><GMail size={18} />Waiting to join</h2>
        {invites.length === 0 ? (
          <p className="bl-empty"><GMail size={16} />No open invites. An invite is good for 7 days.</p>
        ) : (
          <ul className="tm-inv">
            {invites.map((i) => (
              <li key={i.id}>
                <GMail size={16} />
                <span className="tm-inv-who"><b>{i.email}</b><em>as {i.role === "admin" ? "an admin" : "a member"}{i.by ? `, invited by ${i.by}` : ""} <Ago iso={i.sentAt} /></em></span>
                <span className="tm-inv-exp">Good until {i.expires}</span>
                {can && <button type="button" className="ky-revoke" onClick={() => open({
                  title: `Cancel the invite to ${i.email}?`, G: GClose, go: "Cancel the invite", path: "/api/console/team/cancel", body: { id: i.id },
                  text: <>The link in their email stops working at once. You can invite them again any time.</>,
                })}><GClose size={14} />Cancel</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <dialog ref={inviteD} className="fm-dialog" aria-labelledby="tm-inv-d"><InviteForm key={n} owner={me.role === "owner"} close={() => inviteD.current?.close()} done={() => router.refresh()} /></dialog>
      <dialog ref={askD} className="fm-dialog" aria-labelledby="tm-ask-h">{ask && <AskIt key={ask.path + JSON.stringify(ask.body)} a={ask} close={() => askD.current?.close()} done={() => { askD.current?.close(); router.refresh(); }} />}</dialog>
    </>
  );
}

function AskIt({ a, close, done }: { a: Ask; close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const demo = useDemo();
  const [said, setSaid] = useState(false);
  return (
    <>
      <h2 id="tm-ask-h">{a.title}</h2>
      <p>{a.text}</p>
      {problem && <p className="fm-error" role="alert">{problem}</p>}
      {said && <DemoSaid what={<>this happens at once and is written to the audit log.</>} />}
      <div className="fm-dialog-do">
        <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={async () => {
          if (demo) { setSaid(true); return; }
          setBusy(true);
          const r = await post(a.path, a.body);
          setBusy(false);
          if (r.ok) done(); else setProblem(words(r.problems));
        }}>{busy ? <GClock size={16} /> : <a.G size={16} />}{a.go}</button>
        <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={close}><GUser size={16} />Keep it</button>
      </div>
    </>
  );
}

function InviteForm({ owner, close, done }: { owner: boolean; close: () => void; done: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<{ to: string; mailed: boolean } | null>(null);
  const demo = useDemo();
  const [said, setSaid] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblem(null);
    const r = await post("/api/console/team/invite", { email, role });
    setBusy(false);
    if (r.ok) { setSent({ to: email.trim().toLowerCase(), mailed: r.emailSent !== false }); done(); } else setProblem(words(r.problems));
  }
  if (sent) return (
    <>
      <h2 id="tm-inv-d">Invite sent</h2>
      <p>{sent.mailed ? <><b>{sent.to}</b> has an email with a link to join, good for 7 days. They show under Waiting to join until then.</> : <>The invite is made, but the email to <b>{sent.to}</b> didn&apos;t go out. Cancel it and invite again in a few minutes.</>}</p>
      <div className="fm-dialog-do"><button type="button" className="wb-go fm-btn" onClick={close}><GCheck size={16} />Done</button></div>
    </>
  );
  return (
    <form onSubmit={go} noValidate>
      <h2 id="tm-inv-d">Invite someone</h2>
      <p>They get an email with a link to join this account. They choose their own name and password.</p>
      <div className="fm sc-ask">
        <Field kind="email" label="Their email" bad={!!problem} error={problem ?? undefined}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="lea@harborphysio.com" autoFocus spellCheck={false} autoCapitalize="none" />
        </Field>
        <fieldset className="tm-roles">
          <legend className="fm-label">As</legend>
          {(["member", "admin"] as const).map((r) => (
            <label key={r} className={`tm-pick${role === r ? " tm-picked" : ""}${r === "admin" && !owner ? " tm-nope" : ""}`}>
              <input type="radio" name="role" value={r} checked={role === r} disabled={r === "admin" && !owner} onChange={() => setRole(r)} />
              <GShield size={15} /><span><b>{roleWords[r]}</b><em>{r === "admin" && !owner ? "Only the owner invites an admin" : roleLine[r]}</em></span>
            </label>
          ))}
        </fieldset>
      </div>
      {said && <DemoSaid what={<>they get an email with a link to join, good for 7 days, and the invite shows under Waiting to join.</>} />}
      <div className="fm-dialog-do">
        <button type="submit" className="wb-go fm-btn" disabled={busy || !email.includes("@")}>{busy ? <GClock size={16} /> : <GMail size={16} />}{busy ? "Sending" : "Send the invite"}</button>
        <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={close}><GClose size={16} />Not now</button>
      </div>
    </form>
  );
}
