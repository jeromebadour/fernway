import "server-only";
import { notFound } from "next/navigation";

// Sign up, sign in and the account area are pictured and built in step 5, but stay hidden in production (a plain 404,
// BUILD-RULES 2.8) until real accounts are wired behind them. FERNWAY_ACCOUNTS=on shows them (local pictures, CI later).
export function accountsOrNotFound() {
  if (process.env.FERNWAY_ACCOUNTS !== "on") notFound();
}
