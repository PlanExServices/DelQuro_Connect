"""Shift handoffs: SBAR cards, receipts, resolve/reopen and permissions.

Runs against a live backend (BACKEND_URL), like the other suites. Locally:
    IN_MEMORY_DB=1 SEED_DEMO=1 python backend/dev_server.py
    pytest backend/tests/test_handoffs.py -n 0
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = os.environ.get("DEMO_PASSWORD", "Delquro2026")


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def am_tech():
    return _login(os.environ.get("HANDOFF_AM_EMAIL", "alice@delquroconnect.com"))


@pytest.fixture(scope="module")
def pm_tech():
    return _login(os.environ.get("HANDOFF_PM_EMAIL", "marcus@delquroconnect.com"))


@pytest.fixture(scope="module")
def mgr():
    return _login(os.environ.get("HANDOFF_MANAGER_EMAIL", "cody@delquroconnect.com"))


def _card(headers, **over):
    body = {"kind": "patient", "priority": "watch", "shift": "AM",
            "title": f"Biscuit {uuid.uuid4().hex[:5]}", "location": "ICU 3",
            "situation": "Post-op TPLO, recovering", "assessment": "Pain 2/4",
            "recommendation": "Methadone due 14:00, walk at 16:00"}
    body.update(over)
    r = requests.post(f"{API}/handoffs", headers=headers, json=body, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


class TestHandoffs:
    def test_validation(self, am_tech):
        r = requests.post(f"{API}/handoffs", headers=am_tech, timeout=10,
                          json={"kind": "nonsense", "title": "x", "situation": "y"})
        assert r.status_code == 422

    def test_open_list_sorted_by_priority(self, am_tech):
        routine = _card(am_tech, priority="routine")
        critical = _card(am_tech, priority="critical")
        ids = [h["id"] for h in requests.get(f"{API}/handoffs", headers=am_tech, timeout=10).json()]
        assert ids.index(critical["id"]) < ids.index(routine["id"])

    def test_receive_and_summary(self, am_tech, pm_tech):
        card = _card(am_tech)
        before = requests.get(f"{API}/handoffs/summary", headers=pm_tech, timeout=10).json()
        r = requests.post(f"{API}/handoffs/{card['id']}/receive", headers=pm_tech, timeout=10)
        assert r.status_code == 200 and r.json()["received_by_me"] is True
        # Receiving twice doesn't duplicate.
        r = requests.post(f"{API}/handoffs/{card['id']}/receive", headers=pm_tech, timeout=10)
        assert len(r.json()["received"]) == 1
        after = requests.get(f"{API}/handoffs/summary", headers=pm_tech, timeout=10).json()
        assert after["unreceived"] == before["unreceived"] - 1

    def test_update_clears_receipts(self, am_tech, pm_tech):
        card = _card(am_tech)
        requests.post(f"{API}/handoffs/{card['id']}/receive", headers=pm_tech, timeout=10)
        body = {k: card[k] for k in ("kind", "priority", "shift", "title", "location", "situation",
                                     "background", "assessment", "recommendation", "due_at")}
        body["assessment"] = "Pain 3/4, call DVM"
        r = requests.put(f"{API}/handoffs/{card['id']}", headers=pm_tech, json=body, timeout=10)
        assert r.status_code == 200
        assert r.json()["assessment"] == "Pain 3/4, call DVM" and r.json()["received"] == []

    def test_resolve_and_reopen(self, am_tech, pm_tech):
        card = _card(am_tech)
        r = requests.post(f"{API}/handoffs/{card['id']}/resolve", headers=pm_tech, json={"note": "Discharged"}, timeout=10)
        assert r.status_code == 200 and r.json()["status"] == "resolved"
        open_ids = [h["id"] for h in requests.get(f"{API}/handoffs", headers=am_tech, timeout=10).json()]
        assert card["id"] not in open_ids
        done = requests.get(f"{API}/handoffs?status=resolved", headers=am_tech, timeout=10).json()
        assert any(h["id"] == card["id"] and h["resolution_note"] == "Discharged" for h in done)
        assert requests.post(f"{API}/handoffs/{card['id']}/resolve", headers=pm_tech, json={}, timeout=10).status_code == 400
        r = requests.post(f"{API}/handoffs/{card['id']}/reopen", headers=am_tech, timeout=10)
        assert r.status_code == 200 and r.json()["status"] == "open"

    def test_delete_permissions(self, am_tech, pm_tech, mgr):
        card = _card(am_tech)
        assert requests.delete(f"{API}/handoffs/{card['id']}", headers=pm_tech, timeout=10).status_code == 403
        assert requests.delete(f"{API}/handoffs/{card['id']}", headers=mgr, timeout=10).status_code == 200
        assert requests.get(f"{API}/handoffs/summary", headers=mgr, timeout=10).status_code == 200
        assert requests.post(f"{API}/handoffs/nope/receive", headers=mgr, timeout=10).status_code == 404
