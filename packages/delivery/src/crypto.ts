// Secrets at rest and signed values in transit, both from one key (FERNWAY_TOKEN_KEY, 32 bytes hex, on the box only).
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function keyFrom(hex: string | undefined): Buffer {
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("FERNWAY_TOKEN_KEY must be 64 hex characters");
  return Buffer.from(hex, "hex");
}

// A separate key for each job, so a signature can never be read as a ciphertext or the other way round.
const derive = (key: Buffer, purpose: string) => createHmac("sha256", key).update(purpose).digest();

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", derive(key, "seal"), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(key: Buffer, sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("not a sealed value");
  const d = createDecipheriv("aes-256-gcm", derive(key, "seal"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** A signed, expiring value: "<payload>.<signature>". Payload is base64url JSON with an `exp` (ms). */
export function signValue(key: Buffer, purpose: string, payload: object, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = createHmac("sha256", derive(key, `sign:${purpose}`)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyValue<T extends object>(key: Buffer, purpose: string, token: string | null | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", derive(key, `sign:${purpose}`)).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return typeof value.exp === "number" && value.exp > Date.now() ? value : null;
  } catch {
    return null;
  }
}
