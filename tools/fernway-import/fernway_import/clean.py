"""Reading a messy CSV and tidying each row into a Fernway contact.

Exports from CRMs, sheets and form tools name their columns every way there is ("E-mail", "Email Address", "fname",
"Mobile"), mix upper and lower case, and leave typos in addresses. Each column is matched to a Fernway field by its
name; anything that can't be made right is reported with the row it came from, never guessed.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field

FIELDS = ("firstName", "lastName", "email", "phone", "companyName", "website", "message")

# Column names as exports write them, lower-cased with spaces, dashes and underscores removed.
ALIASES: dict[str, tuple[str, ...]] = {
    "firstName": ("firstname", "first", "fname", "givenname", "forename"),
    "lastName": ("lastname", "last", "lname", "surname", "familyname"),
    "fullName": ("name", "fullname", "contactname", "contact", "yourname"),
    "email": ("email", "emailaddress", "mail", "workemail", "emailid"),
    "phone": ("phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "tel", "telephone", "whatsapp"),
    "companyName": ("company", "companyname", "business", "businessname", "organization", "organisation", "org"),
    "website": ("website", "web", "url", "site", "homepage", "domain"),
    "message": ("message", "notes", "note", "comments", "comment", "enquiry", "inquiry", "details"),
}

# The same address mistakes the Fernway forms offer to fix as people type.
DOMAIN_TYPOS = {
    "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com",
    "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
    "hotmail.con": "hotmail.com", "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outlook.con": "outlook.com",
    "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "iclod.com": "icloud.com", "icloud.con": "icloud.com",
}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,63}$")


def key_of(header: str) -> str:
    return re.sub(r"[\s_\-.]+", "", header.strip().lower())


def map_columns(headers: list[str], given: dict[str, str] | None = None) -> dict[str, str]:
    """Each CSV column that matches a field, as {column: field}. `given` ({column: field}) wins over the guesses."""
    out: dict[str, str] = {}
    taken: set[str] = set()
    for col, f in (given or {}).items():
        if col not in headers:
            raise ValueError(f'no column called "{col}" in the file')
        if f not in (*FIELDS, "fullName"):
            raise ValueError(f'"{f}" is not a Fernway field ({", ".join(FIELDS)}, fullName)')
        out[col] = f
        taken.add(f)
    for col in headers:
        if col in out:
            continue
        k = key_of(col)
        for f, names in ALIASES.items():
            if f not in taken and k in names:
                out[col] = f
                taken.add(f)
                break
    return out


def read_csv(data: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """The file's columns and rows, whatever its encoding (UTF-8, with or without a BOM, or Windows-1252) and separator."""
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip() for h in (reader.fieldnames or [])]
    rows = [{(k or "").strip(): (v or "") for k, v in r.items()} for r in reader]
    return headers, [r for r in rows if any(v.strip() for v in r.values())]


def tidy_name(s: str) -> str:
    """ "JOHN" and "john" become "John"; a name already in mixed case ("McKenzie", "van der Berg") stays as written."""
    s = " ".join(s.split())
    if s and (s.isupper() or s.islower()):
        return " ".join(w[:1].upper() + w[1:].lower() if w.lower() not in ("van", "von", "de", "der", "da", "di", "la", "le") else w.lower() for w in s.split(" ")).replace("'S ", "'s ")
    return s


def tidy_email(s: str) -> tuple[str, str | None]:
    """The address lower-cased with known domain typos fixed, and what was fixed (None when nothing was)."""
    e = s.strip().strip("<>").replace(" ", "").lower().rstrip(".")
    if e.startswith("mailto:"):
        e = e[7:]
    if "@" in e:
        local, _, domain = e.rpartition("@")
        if domain in DOMAIN_TYPOS:
            return f"{local}@{DOMAIN_TYPOS[domain]}", f"{domain} → {DOMAIN_TYPOS[domain]}"
    return e, None


def tidy_phone(s: str, country: str) -> str | None:
    """E.164 (+15035550142), as GHL wants it. A number without a country code gets `country` (digits, e.g. "1" or
    "44"), its trunk 0 dropped. None when it can't be a real number."""
    raw = s.strip()
    if not raw:
        return None
    raw = re.sub(r"(?i)\s*(ext|x)\.?\s*\d+$", "", raw)
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        n = digits
    elif digits.startswith("00"):
        n = digits[2:]
    elif country == "1" and len(digits) == 11 and digits.startswith("1"):
        n = digits
    else:
        n = country + digits.lstrip("0")
    return f"+{n}" if re.fullmatch(r"[1-9]\d{6,14}", n) else None


def tidy_website(s: str) -> str:
    w = s.strip()
    if w and not re.match(r"(?i)^https?://", w):
        w = "https://" + w
    return w[:200]


@dataclass
class Row:
    """One contact read from the file: its line number(s), the tidied fields, and what was changed or refused."""
    lines: list[int]
    contact: dict[str, str]
    fixes: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)


def tidy_row(line: int, raw: dict[str, str], columns: dict[str, str], country: str) -> Row:
    c: dict[str, str] = {}
    row = Row([line], c)
    for col, f in columns.items():
        v = (raw.get(col) or "").strip()
        if not v:
            continue
        if f == "fullName":
            parts = tidy_name(v).split(" ")
            c.setdefault("firstName", parts[0][:80])
            if len(parts) > 1:
                c.setdefault("lastName", " ".join(parts[1:])[:80])
        elif f in ("firstName", "lastName"):
            c[f] = tidy_name(v)[:80]
        elif f == "email":
            e, fix = tidy_email(v)
            if EMAIL.match(e):
                c["email"] = e
                if fix:
                    row.fixes.append(f"email {fix}")
            else:
                row.problems.append(f'email "{v[:60]}" is not an address')
        elif f == "phone":
            p = tidy_phone(v, country)
            if p:
                c["phone"] = p
            else:
                row.problems.append(f'phone "{v[:40]}" is not a full number')
        elif f == "companyName":
            c[f] = " ".join(v.split())[:120]
        elif f == "website":
            c[f] = tidy_website(v)
        elif f == "message":
            c[f] = v[:2000]
    if "email" not in c and "phone" not in c:
        row.problems.append("no email and no phone, so GHL can't match the contact")
    return row
