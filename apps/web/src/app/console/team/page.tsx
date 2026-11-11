import type { Metadata } from "next";
import { MAX_TEAM, teamView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { whenFor } from "@/lib/when-for";
import { GUser } from "@/ui/glyphs";
import { day } from "@/ui/when";
import { Team } from "./parts";

export const metadata: Metadata = { title: "Team · Fernway" };
export const dynamic = "force-dynamic";

// The team: who can use this account and as what. Owners and admins invite by email; the owner changes roles;
// removing someone ends their sign-in at once. Members see the team and nothing to change.
export default async function TeamPage() {
  const m = await requirePerson("/console/team");
  const w = await whenFor(m);
  const t = await teamView(delivery().db, m.accountId);
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GUser size={16} />Team</p>
        <h1 className="ac-h1">Who works in this account.</h1>
      </header>
      <Team
        me={{ userId: m.userId, role: m.role }}
        max={MAX_TEAM}
        members={t.members.map((x) => ({ ...x, joined: day(x.joinedAt, w) }))}
        invites={t.invites.map((x) => ({ ...x, expires: day(x.expiresAt, w) }))}
      />
    </>
  );
}
