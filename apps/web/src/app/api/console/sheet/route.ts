import { linkSheet, unlinkSheet } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { answer, manager, outcome } from "@/lib/console-api";
import { sheetsClient } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Links the account's Google Sheet (owners and admins): Fernway checks it can open and write it first. Audited.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  const sheets = sheetsClient();
  if (!sheets) return answer(503, { ok: false, problems: ["Google Sheets isn't set up on this server yet"] });
  if (typeof s.body.sheet !== "string") return answer(422, { ok: false, problems: ["sheet: the link of a Google Sheet"] });
  return outcome(await linkSheet(delivery().db, sheets, s.m, s.body.sheet));
}

// Unlinks it: the rows already in the sheet stay. Audited.
export async function DELETE(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  return (await unlinkSheet(delivery().db, s.m)) ? answer(200, { ok: true }) : answer(403, { ok: false, problems: ["only the owner or an admin may unlink the sheet"] });
}
