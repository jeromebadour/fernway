import type { ConsoleWho } from "@/lib/console-data";
import { MAX_TEAM } from "@fernway/delivery";
import { GUser } from "@/ui/glyphs";
import { day } from "@/ui/when";
import { Team } from "../team/parts";


// The team: who can use this account and as what. Owners and admins invite by email; the owner changes roles;
// removing someone ends their sign-in at once. Members see the team and nothing to change.
export async function TeamPage({ who }: { who: ConsoleWho }) {
  const m = who;
  const w = who.when;
  const t = await who.data.team();
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
