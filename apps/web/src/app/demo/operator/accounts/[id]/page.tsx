import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoAccountDetail, demoWhen } from "@/lib/operator-demo";
import { AccountView } from "../../../../operator/_views/business";

export const metadata: Metadata = { title: "Account · Operator console demo · Fernway" };

export default async function Account({ params }: { params: Promise<{ id: string }> }) {
  const a = demoAccountDetail(Number((await params).id));
  if (!a) notFound();
  return <AccountView a={a} w={demoWhen} base="/demo/operator" can demo />;
}
