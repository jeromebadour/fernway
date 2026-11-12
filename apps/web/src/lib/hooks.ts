import "server-only";
import { keyFrom } from "@fernway/delivery";
import { appUrl } from "./account-api";
import { delivery } from "./connect";

/** Hosts allowed over plain http (CI's stand-in only; empty on the box). */
export const insecureHosts = () => (process.env.FERNWAY_WEBHOOK_INSECURE_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const hookCtx = () => ({ db: delivery().db, key: keyFrom(process.env.FERNWAY_TOKEN_KEY), appUrl: appUrl(), insecureHosts: insecureHosts() });
