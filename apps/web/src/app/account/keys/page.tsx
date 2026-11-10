import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listKeys, MAX_KEYS } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { whenFor } from "@/lib/when-for";
import { GKey } from "@/ui/glyphs";
import { day } from "@/ui/when";
import { KeyList } from "./list";

export const metadata: Metadata = { title: "API keys · Fernway" };
export const dynamic = "force-dynamic";

// API keys: owners and admins only (a member never sees the section). A key is shown once, when made.
export default async function Keys() {
  const m = await requirePerson("/account/keys");
  if (m.role === "member") notFound();
  const w = await whenFor(m);
  const keys = (await listKeys(delivery().db, m.accountId)).map((k) => ({
    ...k, made: day(k.createdAt, w), revoked: k.revokedAt ? day(k.revokedAt, w) : null,
  }));
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GKey size={16} />API keys</p>
        <h1 className="ac-h1">Keys that send leads as {m.accountName}.</h1>
      </header>
      <KeyList keys={keys} max={MAX_KEYS} />
    </>
  );
}
