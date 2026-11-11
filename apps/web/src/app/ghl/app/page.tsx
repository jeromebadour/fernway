import type { Metadata } from "next";
import "./ghl-app.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { GhlApp } from "./app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fernway · in GHL" };

// Fernway's page inside GoHighLevel's left menu. GHL frames it and tells it who is looking; no Fernway sign-in.
export default function Page() {
  accountsOrNotFound();
  return <GhlApp />;
}
