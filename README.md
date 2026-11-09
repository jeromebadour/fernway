# Fernway

**Lead delivery for GoHighLevel.** Fernway carries every form, booking and payment from a website into GoHighLevel,
re-sends anything GHL refuses, and keeps a receipt for every hand-off. Each lead travels as a tracked waybill:
picked up, checked, handed to GHL, signed for.

**Being built in the open.** This README grows into the full story (live link, demo, screenshots, how it's built and
tested) when Fernway launches.

## In this repo

| Path | What it is |
|---|---|
| `apps/web` | the Next.js app: public site, account, console, API |
| `apps/worker` | the delivery worker (Redis queue): sends to GHL, retries, writes every scan |
| `packages/core` | shared rules: waybill numbers, the delivery promise (8 tries over 24 h) |
| `db` | Postgres migrations, applied on every deploy |
| `ops`, `scripts` | Nginx config and the deploy script for the server |

## Run the checks

```bash
npm ci
npm run typecheck && npm run lint && npm run test:unit
```

Built by [Jerome Badour](https://jeromebadour.com). All rights reserved (see `LICENSE`).
