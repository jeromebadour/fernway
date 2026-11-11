import { boardView, logStates, syncLog, type LogState } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { appWho, json } from "@/lib/ghl-app";

export const dynamic = "force-dynamic";

// The sub-account's deliveries for the page inside GHL: the board in short and a page of leads (by state, found by
// waybill, name, email, company or phone). Only the ticket's own account.
export async function GET(request: Request) {
  const who = appWho(request);
  if (!who) return json(401, { ok: false });
  const u = new URL(request.url);
  const state = logStates.find((s) => s === u.searchParams.get("state")) as LogState | undefined;
  const { db } = delivery();
  const [board, log] = await Promise.all([
    boardView(db, who.accountId),
    syncLog(db, who.accountId, { q: u.searchParams.get("q") ?? undefined, state, page: Number(u.searchParams.get("page")) || 1 }),
  ]);
  return json(200, { ok: true, board, log });
}
