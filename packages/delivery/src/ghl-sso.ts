// Who is looking at Fernway's page inside GHL. GHL hands the page the signed-in GHL user as a string encrypted with the
// app's shared secret (made in the developer portal), in CryptoJS's passphrase format: base64 of "Salted__", an 8-byte
// salt, then AES-256-CBC, with the key and IV drawn from the secret and salt by OpenSSL's EVP_BytesToKey (MD5). Only
// GHL and Fernway hold the secret, so a string that opens to a well-formed user came from GHL.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signValue, verifyValue } from "./crypto.js";
import type { Db } from "./db.js";
import { accounts, ghlConnections } from "./schema.js";

const keyAndIv = (secret: string, salt: Buffer) => {
  let prev = Buffer.alloc(0);
  const out: Buffer[] = [];
  while (Buffer.concat(out).length < 48) {
    prev = createHash("md5").update(Buffer.concat([prev, Buffer.from(secret, "utf8"), salt])).digest();
    out.push(prev);
  }
  const all = Buffer.concat(out);
  return { key: all.subarray(0, 32), iv: all.subarray(32, 48) };
};

export const ghlUser = z.object({
  userId: z.string().min(1).max(80),
  companyId: z.string().min(1).max(80).optional(),
  role: z.string().max(40).optional(),
  type: z.enum(["location", "agency"]).optional(),
  activeLocation: z.string().min(1).max(80).optional(),
  userName: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
}).passthrough();
export type GhlUser = z.infer<typeof ghlUser>;

/** The GHL user in an encrypted payload, or null for anything that isn't one (wrong secret, tampered, malformed). */
export function openGhlUser(payload: unknown, secret: string): GhlUser | null {
  if (typeof payload !== "string" || payload.length > 4000 || !secret) return null;
  try {
    const raw = Buffer.from(payload, "base64");
    if (raw.length < 32 || raw.subarray(0, 8).toString("latin1") !== "Salted__") return null;
    const { key, iv } = keyAndIv(secret, raw.subarray(8, 16));
    const d = createDecipheriv("aes-256-cbc", key, iv);
    const text = Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString("utf8");
    const u = ghlUser.safeParse(JSON.parse(text));
    return u.success ? u.data : null;
  } catch {
    return null;
  }
}

/** The same format, made the way GHL makes it: for tests and the local stand-in only. */
export function sealGhlUser(user: object, secret: string): string {
  const salt = randomBytes(8);
  const { key, iv } = keyAndIv(secret, salt);
  const c = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([Buffer.from("Salted__", "latin1"), salt, c.update(JSON.stringify(user), "utf8"), c.final()]).toString("base64");
}

export const GHL_APP_TICKET_MS = 2 * 60 * 60_000;
export type GhlAppWho = { accountId: number; location: string; ghlUserId: string; name: string };

/** Opens Fernway's page inside GHL for the user GHL vouches for: their sub-account must be connected to a Fernway
 *  account. Gives a 2-hour signed ticket the page uses for its calls (no cookie: the page lives in GHL's frame). */
export async function ghlAppSession(db: Db, key: Buffer, payload: unknown, secret: string):
  Promise<{ ok: true; ticket: string; who: GhlAppWho; accountName: string } | { ok: false; why: "payload" | "agency" | "not-connected" }> {
  const u = openGhlUser(payload, secret);
  if (!u) return { ok: false, why: "payload" };
  if (!u.activeLocation) return { ok: false, why: "agency" };
  const [c] = await db.select({ accountId: ghlConnections.accountId, name: accounts.name }).from(ghlConnections)
    .innerJoin(accounts, eq(accounts.id, ghlConnections.accountId)).where(eq(ghlConnections.locationId, u.activeLocation)).orderBy(ghlConnections.accountId).limit(1);
  if (!c) return { ok: false, why: "not-connected" };
  const who: GhlAppWho = { accountId: c.accountId, location: u.activeLocation, ghlUserId: u.userId, name: (u.userName || u.email || "A GHL user").slice(0, 70) };
  return { ok: true, ticket: signValue(key, "ghl-app", who, GHL_APP_TICKET_MS), who, accountName: c.name };
}

export const ghlAppWho = (key: Buffer, ticket: string | null | undefined) => verifyValue<GhlAppWho>(key, "ghl-app", ticket);
