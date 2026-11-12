import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from fernway_import.cli import main
from fernway_import.send import Client, lead_key, send_all
from fernway_import.clean import Row

SAMPLE = Path(__file__).parent.parent / "examples" / "messy-leads.csv"


class Fake(BaseHTTPRequestHandler):
    """A stand-in Fernway: one waybill per idempotency key, a 429 and a 503 on the first two calls."""
    calls: list = []
    keys: dict = {}
    script: list = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.calls.append({"auth": self.headers["Authorization"], "body": body})
        if Fake.script:
            code = Fake.script.pop(0)
            self.send_response(code)
            if code == 429:
                self.send_header("Retry-After", "1")
            self.end_headers()
            self.wfile.write(b'{"ok":false,"problems":["limit: wait"]}')
            return
        if body["contact"].get("email", "").endswith("@refused.example"):
            self.send_response(422); self.end_headers(); self.wfile.write(b'{"ok":false,"problems":["route: no route called nope"]}'); return
        dup = body["idempotencyKey"] in Fake.keys
        n = Fake.keys.setdefault(body["idempotencyKey"], f"FW 26 {len(Fake.keys) + 100:05d}")
        self.send_response(200 if dup else 201); self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "duplicate": dup, "number": n, "state": "picked_up", "links": {"receipt": f"https://fw.test/track/{n[-5:]}"}}).encode())

    def log_message(self, *a):
        pass


@pytest.fixture()
def fernway():
    Fake.calls, Fake.keys, Fake.script = [], {}, []
    srv = HTTPServer(("127.0.0.1", 0), Fake)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_waits_out_a_429_and_a_503_then_sends(fernway):
    Fake.script = [429, 503]
    waits = []
    c = Client(fernway, "fw_abc_123", sleep=waits.append)
    [s] = send_all(c, [Row([2], {"email": "a@b.example"})], "trial", "batch")
    assert s.number and s.status == 201 and waits == [1.0, 2.0]
    assert Fake.calls[-1]["auth"] == "Bearer fw_abc_123"
    assert Fake.calls[-1]["body"]["source"] == "import" and Fake.calls[-1]["body"]["route"] == "trial"


def test_a_refusal_is_reported_never_retried(fernway):
    [s] = send_all(Client(fernway, "fw_k", sleep=lambda _: None), [Row([2], {"email": "x@refused.example"})], "trial", "b")
    assert s.status == 422 and s.problem == "route: no route called nope" and len(Fake.calls) == 1


def test_the_same_person_in_the_same_batch_has_the_same_key():
    a, b = Row([2], {"email": "a@b.example", "firstName": "A"}), Row([9], {"email": "a@b.example"})
    assert lead_key("x", a) == lead_key("x", b) != lead_key("y", a)


def test_the_cli_checks_then_sends_and_a_second_run_sends_nothing_new(fernway, tmp_path, monkeypatch, capsys):
    f = tmp_path / "leads.csv"
    f.write_bytes(SAMPLE.read_bytes())
    assert main([str(f), "--route", "trial", "--fernway", fernway]) == 0
    assert Fake.calls == []
    out = capsys.readouterr().out
    assert "3 contacts after merging 2 duplicates" in out and "2 rows can't be sent" in out
    monkeypatch.delenv("FERNWAY_API_KEY", raising=False)
    assert main([str(f), "--route", "trial", "--send", "--fernway", fernway]) == 2
    monkeypatch.setenv("FERNWAY_API_KEY", "fw_abc_123")
    assert main([str(f), "--route", "trial", "--send", "--fernway", fernway]) == 0
    assert main([str(f), "--route", "trial", "--send", "--fernway", fernway]) == 0
    assert len(Fake.keys) == 3 and len(Fake.calls) == 6
    out = capsys.readouterr().out
    assert "3 were already sent by an earlier run" in out
    import csv
    with (tmp_path / "leads.fernway.csv").open(encoding="utf-8", newline="") as fh:
        report = list(csv.DictReader(fh))
    assert len(report) == 3 + 2
    assert [r["waybill"][:5] for r in report[:3]] == ["FW 26"] * 3 and all(r["receipt"].startswith("https://fw.test/track/") for r in report[:3])
    assert report[3]["problem"] == "no email and no phone, so GHL can't match the contact"
