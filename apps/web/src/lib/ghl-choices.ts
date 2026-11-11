import "server-only";
import type { Pipeline } from "@fernway/delivery";
import { intake } from "./intake";

export type Choices = { pipelines: Pipeline[]; calendars: { id: string; name: string; minutes: number | null }[] } | { problem: "not-connected" | "unreachable" };

/** The account's pipelines, stages and calendars as GHL has them now, for naming and choosing on the Routes page. */
export async function ghlChoices(accountId: number): Promise<Choices> {
  const { deps } = intake();
  const conn = await deps.connectionFor(accountId).catch(() => null);
  if (!conn) return { problem: "not-connected" };
  try {
    const [pipelines, calendars] = await Promise.all([deps.ghl.listPipelines(conn), deps.ghl.listCalendars(conn)]);
    return { pipelines, calendars };
  } catch (err) {
    console.error(`routes: GHL lists not read: ${err instanceof Error ? err.message : String(err)}`);
    return { problem: "unreachable" };
  }
}
