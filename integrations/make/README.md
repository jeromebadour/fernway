# Fernway hot leads, in Make

The same flow as the n8n workflow, as a Make scenario (free plan) on Fernway's signed webhooks:

1. **Webhook** (Custom webhook) takes the call with *Get request headers* and *JSON pass-through* on, so the body
   arrives as the exact text Fernway signed (`value`) beside the headers (`__IMTHEADERS__`).
2. **Tools 5, 6** read `t` and `v1` out of the `Fernway-Signature` header.
3. **Tools 7, 8** rebuild `"<t>.<raw body>"` and compute `sha256(text; "hex"; secret)`, Make's HMAC-SHA256 with the
   endpoint's secret as the key. **Tools 9** works out the signature's age in seconds.
4. Filter **Signed by Fernway, sent in the last 5 minutes**: the computed hex must equal `v1` and the age be within
   300 s either way. Nothing after it runs otherwise.
5. **JSON 10** parses the body. Filter **Scored 4 or 5**: only `lead.scored` with a score of 4 or 5 goes on.
6. **Google Sheets 11** appends the row (9 columns, `RAW`, so no cell is read as a formula) to the tab *Make hot
   leads*. **Tools 12, 13** write the subject and text; **JSON 15, 16** escape them as JSON strings; **HTTP 14** sends
   the email through Resend, with every non-2xx answer treated as an error.

`fernway-hot-leads.blueprint.json` is the scenario as Make exports it, with three placeholders.

## Setting it up

| # | Step | Where |
|---|---|---|
| 1 | Import the blueprint into a new scenario (⋮, Import blueprint); on the Webhook module pick or create your own custom webhook with *Get request headers* and *JSON pass-through* on | Make |
| 2 | In Fernway, add a webhook endpoint for `scored` to that webhook's address; copy the `whsec_…` secret it shows once | Fernway console, Webhooks (or CLI `hook <acc> "Make hot leads" <url> scored`) |
| 3 | Paste the secret over `PASTE_FERNWAY_SECRET_HERE` in **Tools 8**, inside the quotes | Make |
| 4 | Make the tab: CLI `sheet-tab <acc> "Make hot leads" "Waybill,Scored (UTC),Score,Name,Email,Phone,Company,Claude's read,Receipt"` (or by hand) | box, or Google Sheets |
| 5 | Share the sheet with the Google account Make signs in as (Editor); in **Google Sheets 11** create that connection, put the sheet's id over `PASTE_SPREADSHEET_ID_HERE`, column range A-Z | Google Sheets, Make |
| 6 | A sending-only Resend key over `PASTE_RESEND_KEY_HERE` in **HTTP 14** (keep `Bearer `); change `to` in its body to your address | Resend, Make |
| 7 | Schedule: *Immediately as data arrives*, at most 10 runs a minute; switch the scenario on | Make |

## What it can't do that n8n does

- **No 400 for a bad signature.** A Make webhook answers `200 Accepted` to every call before the scenario runs; the
  filter is the gate, so a forged call is accepted and then does nothing. Fernway counts the delivery as delivered.
- **No constant-time compare.** Make's filter compares text plainly. The signature still can't be made without the
  secret, and the 5-minute window limits replays.
- **The secrets live in the scenario.** Make's free plan has no stored variables, so the Fernway secret and the Resend
  key sit in module fields, and an export of the live scenario contains them. Export only to share with yourself, and
  keep the placeholder copy here as the public one.

## Proven (2026-11-13, sandbox)

- A real `lead.scored` for FW 26 00020 (score 4) ran all 13 modules: a row on *Make hot leads* and the email
  "Hot lead 4 of 5: Northpine Dental" from *Fernway Make*.
- A forged call (score 5, a signature of zeros, a fresh `t`) stopped at the signature filter: no row, no email.
