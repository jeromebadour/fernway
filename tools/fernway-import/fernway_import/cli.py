"""fernway-import: a CSV of leads in, duplicates merged, addresses tidied, sent through Fernway into GoHighLevel.

    fernway-import leads.csv --route trial                 # check only: what would be sent, and what can't be
    FERNWAY_API_KEY=fw_... fernway-import leads.csv --route trial --send

The API key is read from the environment, never from the command line (so it stays out of shell history). Every run
writes <file>.fernway.csv next to the input: one line per contact, with its rows, what was fixed, and its waybill and
receipt or the reason it wasn't sent.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
from pathlib import Path

from . import __version__
from .clean import FIELDS, map_columns, read_csv, tidy_row
from .merge import merge
from .send import Client, Sent, send_all


def build(data: bytes, mapping: dict[str, str] | None, country: str):
    headers, raw = read_csv(data)
    columns = map_columns(headers, mapping)
    rows = [tidy_row(i + 2, r, columns, country) for i, r in enumerate(raw)]
    good, refused = [], []
    for r in rows:
        if "email" in r.contact or "phone" in r.contact:
            # A bad phone beside a good email: the contact still goes, without the phone, and the file says so.
            r.fixes += [f"left out: {p}" for p in r.problems]
            r.problems = []
            good.append(r)
        else:
            refused.append(r)
    merged = merge(good)
    return headers, columns, rows, merged, refused


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="fernway-import", description="Clean a CSV of leads, merge duplicates, and send it through Fernway into GoHighLevel.")
    ap.add_argument("file", type=Path, help="the CSV file")
    ap.add_argument("--route", required=True, help="the Fernway route the leads take, e.g. trial")
    ap.add_argument("--send", action="store_true", help="send them (without it, only check)")
    ap.add_argument("--country", default="1", help="country calling code for numbers written without one (default 1)")
    ap.add_argument("--map", action="append", default=[], metavar="COLUMN=FIELD", help=f"name a column's field yourself; fields: {', '.join(FIELDS)}, fullName")
    ap.add_argument("--fernway", default=os.environ.get("FERNWAY_URL", "https://fernway.jeromebadour.com"), help="Fernway's address")
    ap.add_argument("--version", action="version", version=f"fernway-import {__version__}")
    a = ap.parse_args(argv)

    if not a.country.isdigit():
        ap.error("--country is digits only, e.g. 1 or 44")
    mapping = {}
    for m in a.map:
        col, sep, f = m.partition("=")
        if not sep:
            ap.error(f'--map "{m}": write it as COLUMN=FIELD')
        mapping[col] = f
    try:
        data = a.file.read_bytes()
    except OSError as e:
        print(f"Can't read {a.file}: {e.strerror}", file=sys.stderr)
        return 2
    try:
        headers, columns, rows, merged, refused = build(data, mapping, a.country)
    except ValueError as e:
        print(f"Can't use the columns: {e}", file=sys.stderr)
        return 2
    if not any(f in columns.values() for f in ("email", "phone")):
        print(f"No email or phone column found among: {', '.join(headers)}. Name it with --map COLUMN=email.", file=sys.stderr)
        return 2

    unused = [h for h in headers if h not in columns]
    print(f"Read {len(rows)} rows from {a.file.name}.")
    print("Columns: " + ", ".join(f"{c} → {f}" for c, f in columns.items()) + (f" (left out: {', '.join(unused)})" if unused else ""))
    fixed = sum(1 for r in merged if any(not f.startswith("merged") for f in r.fixes))
    print(f"{len(merged)} contacts after merging {len(rows) - len(refused) - len(merged)} duplicates; {fixed} with a fix; {len(refused)} rows can't be sent.")
    for r in refused:
        print(f"  row {r.lines[0]}: {'; '.join(r.problems)}")

    out = a.file.with_suffix(".fernway.csv")
    if not a.send:
        write(out, [Sent(r, 0) for r in merged], refused, sent=False)
        print(f"Checked only; nothing sent. The contacts as they would go: {out}")
        print("Send them with --send and FERNWAY_API_KEY set.")
        return 0

    key = os.environ.get("FERNWAY_API_KEY", "")
    if not key.startswith("fw_"):
        print("FERNWAY_API_KEY isn't set (an API key from your Fernway account, fw_...).", file=sys.stderr)
        return 2
    batch = hashlib.sha256(data).hexdigest()[:16] + ":" + a.route
    done = {"n": 0}

    def said(s: Sent) -> None:
        done["n"] += 1
        what = f"{s.number}{' (already sent)' if s.duplicate else ''}" if s.number else f"not sent: {s.problem}"
        print(f"  {done['n']:>4}/{len(merged)}  {s.row.contact.get('email') or s.row.contact.get('phone')}  {what}")

    sent = send_all(Client(a.fernway, key), merged, a.route, batch, said)
    ok = [s for s in sent if s.number]
    print(f"Sent {len(ok)} of {len(merged)}; {sum(1 for s in ok if s.duplicate)} were already sent by an earlier run. Waybills and receipts: {out}")
    write(out, sent, refused, sent=True)
    return 0 if len(ok) == len(merged) else 1


def write(path: Path, items: list[Sent], refused: list, sent: bool) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rows", *FIELDS, "fixed", "waybill", "receipt", "problem"])
        for s in items:
            w.writerow([" ".join(map(str, s.row.lines)), *(s.row.contact.get(x, "") for x in FIELDS), "; ".join(s.row.fixes),
                        s.number, s.receipt, s.problem if sent else ""])
        for r in refused:
            w.writerow([" ".join(map(str, r.lines)), *(r.contact.get(x, "") for x in FIELDS), "; ".join(r.fixes), "", "", "; ".join(r.problems)])


if __name__ == "__main__":
    sys.exit(main())
