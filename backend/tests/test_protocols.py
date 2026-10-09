"""Protocol library: versions, sign-offs, re-acknowledgment and audit export.

Runs against a live backend (BACKEND_URL), like the other suites. Locally:
    IN_MEMORY_DB=1 SEED_DEMO=1 python backend/dev_server.py
    pytest backend/tests/test_protocols.py -n 0
"""
import csv
import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = os.environ.get("DEMO_PASSWORD", "Delquro2026")
MANAGER = os.environ.get("PROTOCOL_MANAGER_EMAIL", "cody@delquroconnect.com")
TECH = os.environ.get("PROTOCOL_TECH_EMAIL", "alice@delquroconnect.com")
RECEPTION = os.environ.get("PROTOCOL_RECEPTION_EMAIL", "sophia@delquroconnect.com")


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def mgr():
    return _login(MANAGER)


@pytest.fixture(scope="module")
def tech():
    return _login(TECH)


@pytest.fixture(scope="module")
def reception():
    return _login(RECEPTION)


@pytest.fixture(scope="module")
def protocol(mgr):
    r = requests.post(f"{API}/protocols", headers=mgr, timeout=10, json={
        "title": f"Controlled drug log {uuid.uuid4().hex[:6]}",
        "category": "Controlled Drugs",
        "body": "Count the safe at open and close; two signatures per count.",
        "audience": ["Veterinary Technician", "Veterinarian"],
    })
    assert r.status_code == 200, r.text
    return r.json()


class TestProtocolLibrary:
    def test_staff_cannot_create(self, tech):
        r = requests.post(f"{API}/protocols", headers=tech, timeout=10,
                          json={"title": "x", "body": "y"})
        assert r.status_code == 403

    def test_rejects_unknown_job_title(self, mgr):
        r = requests.post(f"{API}/protocols", headers=mgr, timeout=10,
                          json={"title": "x", "body": "y", "audience": ["Wizard"]})
        assert r.status_code == 422

    def test_created_as_version_one(self, protocol):
        assert protocol["current_version"] == 1
        assert protocol["signed_count"] == 0

    def test_audience_targeting(self, protocol, tech, reception):
        ids = [p["id"] for p in requests.get(f"{API}/protocols", headers=tech, timeout=10).json()]
        assert protocol["id"] in ids
        ids = [p["id"] for p in requests.get(f"{API}/protocols", headers=reception, timeout=10).json()]
        assert protocol["id"] not in ids
        r = requests.get(f"{API}/protocols/{protocol['id']}", headers=reception, timeout=10)
        assert r.status_code == 404
        r = requests.post(f"{API}/protocols/{protocol['id']}/acknowledge?version=1", headers=reception, timeout=10)
        assert r.status_code == 404

    def test_sign_then_new_version_requires_resign(self, protocol, mgr, tech):
        pid = protocol["id"]
        pending = [p["id"] for p in requests.get(f"{API}/protocols/pending", headers=tech, timeout=10).json()]
        assert pid in pending

        r = requests.post(f"{API}/protocols/{pid}/acknowledge?version=1", headers=tech, timeout=10)
        assert r.status_code == 200 and r.json()["my_status"] == "current"
        pending = [p["id"] for p in requests.get(f"{API}/protocols/pending", headers=tech, timeout=10).json()]
        assert pid not in pending

        r = requests.post(f"{API}/protocols/{pid}/versions", headers=mgr, timeout=10,
                          json={"body": "Count at open, midday and close.", "change_note": "Added midday count"})
        assert r.status_code == 200 and r.json()["current_version"] == 2

        detail = requests.get(f"{API}/protocols/{pid}", headers=tech, timeout=10).json()
        assert detail["my_status"] == "needed"
        assert detail["body"] == "Count at open, midday and close."
        assert [v["version"] for v in detail["versions"]] == [2, 1]

        # Signing the stale version is refused.
        r = requests.post(f"{API}/protocols/{pid}/acknowledge?version=1", headers=tech, timeout=10)
        assert r.status_code == 409
        r = requests.post(f"{API}/protocols/{pid}/acknowledge?version=2", headers=tech, timeout=10)
        assert r.status_code == 200

    def test_signoff_roster(self, protocol, mgr, tech):
        r = requests.get(f"{API}/protocols/{protocol['id']}/signoffs", headers=mgr, timeout=10)
        assert r.status_code == 200
        rows = {m["name"]: m for m in r.json()["members"]}
        assert rows["Alice Chen"]["status"] == "current"
        assert rows["Marcus Green"]["status"] == "needed"
        assert "Sophia Taylor" not in rows
        assert requests.get(f"{API}/protocols/{protocol['id']}/signoffs", headers=tech, timeout=10).status_code == 403

    def test_export_has_full_history(self, protocol, mgr, tech):
        assert requests.get(f"{API}/protocols/export.csv", headers=tech, timeout=10).status_code == 403
        r = requests.get(f"{API}/protocols/export.csv", headers=mgr, timeout=10)
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
        rows = [row for row in csv.DictReader(io.StringIO(r.text)) if row["Protocol"] == protocol["title"]]
        alice = {(row["Version"], row["Sign-off status"]) for row in rows if row["Staff member"] == "Alice Chen"}
        assert ("1", "superseded") in alice and ("2", "current") in alice
        assert any(row["Staff member"] == "Marcus Green" and row["Sign-off status"] == "not signed" for row in rows)

    def test_archive_hides_from_staff(self, protocol, mgr, tech):
        pid = protocol["id"]
        assert requests.post(f"{API}/protocols/{pid}/archive", headers=mgr, timeout=10).status_code == 200
        ids = [p["id"] for p in requests.get(f"{API}/protocols", headers=tech, timeout=10).json()]
        assert pid not in ids
        ids = [p["id"] for p in requests.get(f"{API}/protocols?include_archived=true", headers=mgr, timeout=10).json()]
        assert pid in ids
        r = requests.post(f"{API}/protocols/{pid}/archive?archived=false", headers=mgr, timeout=10)
        assert r.status_code == 200 and r.json()["archived"] is False

    def test_bad_id_is_404(self, mgr):
        assert requests.get(f"{API}/protocols/not-an-id", headers=mgr, timeout=10).status_code == 404
