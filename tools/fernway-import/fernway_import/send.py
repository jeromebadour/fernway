"""Sending the cleaned contacts through Fernway's API, one lead each.

Each lead's idempotency key comes from the batch and the person's email (or phone), so running the same import twice
gives the same waybills back instead of new leads. Fernway's limit is 60 requests a minute per key: a 429 waits as long
as its Retry-After says, a server error or no answer waits and tries again, and anything Fernway refuses is reported
with its reason, never retried.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

from .clean import Row


@dataclass
class Sent:
    row: Row
    status: int
    number: str = ""
    receipt: str = ""
    state: str = ""
    duplicate: bool = False
    problem: str = ""


def lead_key(batch: str, row: Row) -> str:
    who = row.contact.get("email") or row.contact.get("phone") or ""
    return "import-" + hashlib.sha256(f"{batch}|{who}".encode()).hexdigest()[:40]


class Client:
    def __init__(self, base: str, key: str, timeout: float = 15.0, sleep: Callable[[float], None] = time.sleep, tries: int = 5):
        self.base = base.rstrip("/")
        self.key = key
        self.timeout = timeout
        self.sleep = sleep
        self.tries = tries

    def post(self, body: dict) -> tuple[int, dict]:
        data = json.dumps(body).encode()
        wait = 2.0
        for attempt in range(1, self.tries + 1):
            req = urllib.request.Request(f"{self.base}/api/v1/leads", data=data, method="POST", headers={
                "Authorization": f"Bearer {self.key}", "Content-Type": "application/json", "User-Agent": "fernway-import/1.0",
            })
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return r.status, json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e:
                payload = _json(e.read())
                if e.code == 429 and attempt < self.tries:
                    self.sleep(float(e.headers.get("Retry-After") or wait))
                    continue
                if e.code >= 500 and attempt < self.tries:
                    self.sleep(wait)
                    wait = min(wait * 2, 60)
                    continue
                return e.code, payload
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt < self.tries:
                    self.sleep(wait)
                    wait = min(wait * 2, 60)
                    continue
                return 0, {"problems": [f"Fernway couldn't be reached: {getattr(e, 'reason', e)}"]}
        return 0, {"problems": ["no answer after every try"]}


def _json(b: bytes) -> dict:
    try:
        return json.loads(b or b"{}")
    except ValueError:
        return {}


def send_all(client: Client, rows: list[Row], route: str, batch: str, said: Callable[[Sent], None] = lambda s: None) -> list[Sent]:
    out = []
    for row in rows:
        status, j = client.post({"idempotencyKey": lead_key(batch, row), "route": route, "source": "import", "contact": row.contact})
        if status in (200, 201):
            s = Sent(row, status, j.get("number", ""), (j.get("links") or {}).get("receipt", ""), j.get("state", ""), bool(j.get("duplicate")))
        else:
            s = Sent(row, status, problem="; ".join(j.get("problems") or [f"Fernway answered {status}"]))
        out.append(s)
        said(s)
    return out
