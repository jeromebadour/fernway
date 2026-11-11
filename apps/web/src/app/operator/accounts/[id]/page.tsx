import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { accountDetail } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { AccountView } from "../../_views/business";

export const metadata: Metadata = { title: "Account · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Account({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireStaff();
  const id = Number((await params).id);
  const a = Number.isInteger(id) && id > 0 ? await accountDetail(delivery().db, id) : null;
  if (!a) notFound();
  return <AccountView a={a} w={await staffWhen()} base="/operator" can={s.role !== "viewer"} />;
}
