# Fernway hot leads, in n8n

A workflow on Fernway's signed webhooks, running on a self-hosted n8n next to Fernway:

1. **Fernway webhook** takes the call at `https://n8n.jeromebadour.com/webhook/fernway-leads`, with its raw body.
2. **Check Fernway's signature** recomputes `HMAC-SHA256(secret, "<t>.<raw body>")` from the `Fernway-Signature`
   header, compares in constant time, and refuses a time more than 5 minutes off.
3. **Signed by Fernway?** answers `200` with the event's id, or `400` (and nothing else happens).
4. **Scored 4 or 5?** keeps only `lead.scored` events with a score of 4 or 5.
5. **The hot lead** picks the columns; **Add to Hot leads** appends them to the tab *Hot leads* of the account's
   Google Sheet (Fernway's own Google service account), and **Email Jerome** sends the alert through Resend.

`fernway-hot-leads.json` is the workflow as n8n exports it; import it into any n8n 2.x.

## On the box

| # | Step | Command (as root, on the box) |
|---|---|---|
| 1 | DNS: `n8n` A `84.247.145.118`, DNS only | in Cloudflare |
| 2 | n8n up, its owner made from a hidden prompt on the box (the setup page is never open), then Nginx and HTTPS | `/srv/fernway/app/integrations/n8n/setup.sh` |
| 3 | Fernway's endpoint to n8n, the sheet's Hot leads tab, the Google credential, the workflow imported and published | `/srv/fernway/app/integrations/n8n/connect.sh 1` |
| 4 | The alert's Resend key and address into `/srv/n8n/.env` (`RESEND_API_KEY`, `ALERT_TO`), then `docker compose -f …/compose.yaml --env-file /srv/n8n/.env up -d --force-recreate` | hidden prompt |

Secrets move between the two env files on the box and are never printed. n8n keeps its own encryption key in
`/srv/n8n/.env`; its workflows and credentials (still encrypted) are exported nightly by Fernway's backup and copied off
the box with Fernway's dumps.

## Variables the workflow reads

| # | Name | What |
|---|---|---|
| 1 | `FERNWAY_HOOK_SECRET` | the endpoint's `whsec_…` secret, shown once by Fernway |
| 2 | `FERNWAY_SHEET_ID` | the Google Sheet with the *Hot leads* tab |
| 3 | `RESEND_API_KEY` | a sending-only Resend key |
| 4 | `ALERT_TO` | who gets the email |
