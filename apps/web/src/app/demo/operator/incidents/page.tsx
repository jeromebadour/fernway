import type { Metadata } from "next";
import { demoIncidents, demoWhen } from "@/lib/operator-demo";
import { IncidentsView } from "../../../operator/_views/people";

export const metadata: Metadata = { title: "Incidents · Operator console demo · Fernway" };

export default function Incidents() {
  const rows = demoIncidents();
  return <IncidentsView v={{ total: rows.length, page: 1, rows }} w={demoWhen} base="/demo/operator" can demo />;
}
