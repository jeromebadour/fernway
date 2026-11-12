"""Merging duplicates: rows that share an email or a phone are one person, as GHL itself would match them.

Matching is transitive (row 1 shares an email with row 2, row 2 a phone with row 3: all three are one), so a person
who changed their phone between two sign-ups is still one contact. The merged contact keeps the earliest email and phone (the
ones GHL matches on), the fullest value of every other field, and every message joined in the order they came.
"""
from __future__ import annotations

from .clean import FIELDS, Row


def merge(rows: list[Row]) -> list[Row]:
    parent = list(range(len(rows)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    seen: dict[str, int] = {}
    for i, r in enumerate(rows):
        for k in ("email", "phone"):
            v = r.contact.get(k)
            if not v:
                continue
            tag = f"{k}:{v}"
            if tag in seen:
                a, b = find(seen[tag]), find(i)
                if a != b:
                    parent[max(a, b)] = min(a, b)
            else:
                seen[tag] = i

    groups: dict[int, list[Row]] = {}
    for i, r in enumerate(rows):
        groups.setdefault(find(i), []).append(r)

    out: list[Row] = []
    for _, members in sorted(groups.items()):
        merged: dict[str, str] = {}
        for f in FIELDS:
            if f == "message":
                parts = [m.contact[f] for m in members if m.contact.get(f)]
                uniq = list(dict.fromkeys(parts))
                if uniq:
                    merged[f] = "\n\n".join(uniq)[:2000]
                continue
            if f in ("email", "phone"):
                # GHL matches on these: the earliest row's stays, so the contact is the one GHL already has.
                first = next((m.contact[f] for m in members if m.contact.get(f)), "")
                if first:
                    merged[f] = first
                continue
            best = ""
            for m in members:
                v = m.contact.get(f, "")
                if len(v) > len(best):
                    best = v
            if best:
                merged[f] = best
        lines = sorted(line for m in members for line in m.lines)
        fixes = [f for m in members for f in m.fixes]
        if len(members) > 1:
            fixes.append(f"merged rows {', '.join(str(n) for n in lines)}")
        out.append(Row(lines, merged, fixes, []))
    return out
