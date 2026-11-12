# fernway-import

A CSV of leads in; duplicates merged, addresses tidied; sent through [Fernway](https://fernway.jeromebadour.com) into
GoHighLevel, each lead with its own waybill and receipt.

```
pip install ./tools/fernway-import
fernway-import leads.csv --route trial                                  # check only
FERNWAY_API_KEY=fw_... fernway-import leads.csv --route trial --send    # send
```

What it does with a file:

| # | Step | How |
|---|------|-----|
| 1 | Reads it | UTF-8 with or without a BOM, or Windows-1252; commas, semicolons, tabs or bars |
| 2 | Names the columns | "E-mail Address", "Mobile", "Business Name", "fname"... matched to Fernway's fields; `--map COLUMN=FIELD` for the rest |
| 3 | Tidies each row | names out of all caps, emails lower-cased with typos fixed (gmial.com → gmail.com), phones to E.164 with `--country` for numbers written without one, websites with https |
| 4 | Merges duplicates | rows sharing an email or a phone are one person, the way GHL matches them; the earliest email and phone stay, the fullest name and company win, every note is kept |
| 5 | Sends | one lead per contact through Fernway's API, source `import`; a 429 waits for its Retry-After, a server error tries again, a refusal is reported with its reason |
| 6 | Reports | `<file>.fernway.csv`: each contact's rows, what was fixed, its waybill and receipt, or why it wasn't sent |

Running the same file again sends nothing new: each lead's idempotency key comes from the file and the person, so
Fernway gives back the waybill it already made. The API key is read from `FERNWAY_API_KEY` only, never from the
command line. Python 3.10 or newer, no other packages.

Try it on `examples/messy-leads.csv`: 7 rows, 3 contacts after merging 2 duplicates, 2 rows that can't be sent.
