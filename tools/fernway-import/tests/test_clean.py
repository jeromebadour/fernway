from pathlib import Path

from fernway_import.clean import map_columns, read_csv, tidy_email, tidy_name, tidy_phone, tidy_row
from fernway_import.cli import build

SAMPLE = Path(__file__).parent.parent / "examples" / "messy-leads.csv"


def test_columns_are_matched_by_what_exports_call_them():
    headers = ["Full Name", "E-mail Address", "Mobile", "Business Name", "Web", "Notes", "Source"]
    assert map_columns(headers) == {"Full Name": "fullName", "E-mail Address": "email", "Mobile": "phone",
                                    "Business Name": "companyName", "Web": "website", "Notes": "message"}
    assert map_columns(headers, {"Source": "message", "Notes": "companyName"})["Source"] == "message"


def test_reads_a_semicolon_file_with_a_bom():
    headers, rows = read_csv(SAMPLE.read_bytes())
    assert headers[0] == "Full Name" and len(rows) == 7


def test_tidying():
    assert tidy_name("LENA HARTMANN") == "Lena Hartmann"
    assert tidy_name("ana van der berg") == "Ana van der Berg"
    assert tidy_name("McKenzie") == "McKenzie"
    assert tidy_email(" Lena@Northpine.COM ") == ("lena@northpine.com", None)
    assert tidy_email("t@gmial.com") == ("t@gmail.com", "gmial.com → gmail.com")
    assert tidy_phone("(503) 555-0142", "1") == "+15035550142"
    assert tidy_phone("1 503 555 0142", "1") == "+15035550142"
    assert tidy_phone("0044 20 7946 0911", "1") == "+442079460911"
    assert tidy_phone("020 7946 0958", "44") == "+442079460958"
    assert tidy_phone("555-01 ext 4", "1") is None


def test_a_row_says_what_it_fixed_and_what_it_refused():
    cols = {"n": "fullName", "e": "email", "p": "phone"}
    r = tidy_row(2, {"n": "sam okafor", "e": "sam@okafor", "p": "555-01"}, cols, "1")
    assert r.contact == {"firstName": "Sam", "lastName": "Okafor"}
    assert r.problems == ['email "sam@okafor" is not an address', 'phone "555-01" is not a full number',
                          "no email and no phone, so GHL can't match the contact"]


def test_the_sample_file_end_to_end():
    _, _, rows, merged, refused = build(SAMPLE.read_bytes(), None, "1")
    assert len(rows) == 7
    # Lena twice (same email in two cases) and Ana twice (email on one row, the same phone on both) are one each.
    assert [r.contact.get("email") for r in merged] == ["lena@northpine.com", "tomas.reyes@gmail.com", "ana.vdberg@outlook.com"]
    lena, tomas, ana = merged
    assert lena.lines == [2, 3] and lena.contact["companyName"] == "Northpine Dental Group"
    assert lena.contact["message"] == "Wants a demo next week\n\nAsked about pricing"
    assert lena.contact["phone"] == "+15035550142" and lena.contact["website"] == "https://northpine.com"
    assert "email gmial.com → gmail.com" in tomas.fixes
    assert ana.lines == [6, 7] and ana.contact["companyName"] == "Berg Physio" and ana.contact["firstName"] == "Ana"
    assert "merged rows 6, 7" in ana.fixes
    # The card with no details and Sam's half-written row can't be sent; each says why.
    assert [r.lines[0] for r in refused] == [5, 8]
