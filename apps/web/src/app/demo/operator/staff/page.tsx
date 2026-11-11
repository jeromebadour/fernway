import type { Metadata } from "next";
import { demoAudit, demoStaff, demoStaffList, demoWhen } from "@/lib/operator-demo";
import { StaffView } from "../../../operator/_views/people";

export const metadata: Metadata = { title: "Staff · Operator console demo · Fernway" };

export default function Staff() {
  return <StaffView staff={demoStaffList()} audit={demoAudit()} me={{ userId: demoStaff.userId, role: demoStaff.role }} w={demoWhen} base="/demo/operator" demo />;
}
