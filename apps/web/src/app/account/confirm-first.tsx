"use client";
// In place of an action that works in the account's name (paying, an API key), until the email is confirmed.
import { GMail } from "@/ui/glyphs";
import { ConfirmAgain } from "./profile-form";

export function ConfirmFirst({ what }: { what: string }) {
  return (
    <div className="cf" role="status">
      <GMail size={18} />
      <div><p className="cf-t">Confirm your email first</p><p className="cf-l">{what} works once your email is confirmed. The link is in your inbox.</p></div>
      <ConfirmAgain />
    </div>
  );
}
