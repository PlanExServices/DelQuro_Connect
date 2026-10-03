"""Tests for the 3 change requests: no-demo-data, celebrations list, schedule updates."""
import io
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "planexservices@gmail.com"
ADMIN_PASS = "Delquro2026"


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------- no demo data ----------
class TestNoDemoData:
    def test_only_admin_user(self, admin_token):
        r = requests.get(f"{API}/team/members", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        members = r.json()
        assert len(members) == 1, f"expected only admin, got {[m['email'] for m in members]}"
        assert members[0]["email"] == ADMIN_EMAIL
        assert members[0]["role"] == "admin"

    def test_no_posts(self, admin_token):
        r = requests.get(f"{API}/posts", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200 and r.json() == []

    def test_no_kudos(self, admin_token):
        r = requests.get(f"{API}/kudos", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200 and r.json() == []

    def test_spotlight_none(self, admin_token):
        r = requests.get(f"{API}/kudos/spotlight", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200 and r.json().get("spotlight") is None

    def test_no_schedules(self, admin_token):
        for period in ("previous", "current", "upcoming"):
            r = requests.get(f"{API}/schedules?period={period}", headers=_h(admin_token), timeout=10)
            assert r.status_code == 200 and r.json() == [], f"period {period} not empty"

    def test_no_locations(self, admin_token):
        r = requests.get(f"{API}/locations", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200 and r.json() == []

    def test_no_invites(self, admin_token):
        r = requests.get(f"{API}/invites", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200 and r.json() == []

    def test_only_everyone_chat_or_none(self, admin_token):
        r = requests.get(f"{API}/chats", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        # allow at most one 'everyone' chat, but no custom demo groups
        chats = r.json()
        for c in chats:
            assert c.get("is_everyone") or False, f"unexpected non-everyone chat: {c}"


# ---------- celebrations ----------
class TestCelebrations:
    def test_windows_and_populate(self, admin_token):
        today = datetime.now(timezone.utc).date()
        bday = f"{today.month:02d}-{today.day:02d}"
        start_date = (today.replace(year=today.year - 2)).isoformat()

        # PATCH /me: set birthday + start_date
        r = requests.patch(f"{API}/me", headers=_h(admin_token),
                           json={"birthday": bday, "start_date": start_date}, timeout=10)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["birthday"] == bday
        assert me["start_date"] == start_date

        try:
            # birthdays with window
            b = requests.get(f"{API}/team/birthdays?window=366", headers=_h(admin_token), timeout=10)
            assert b.status_code == 200
            bdata = b.json()
            assert any(x["name"] == "Plan Ex" for x in bdata), f"admin not in birthdays: {bdata}"
            # should be sorted ascending by days
            days_list = [x["days"] for x in bdata]
            assert days_list == sorted(days_list)
            # today => days=0 for admin
            plan_ex = next(x for x in bdata if x["name"] == "Plan Ex")
            assert plan_ex["days"] == 0

            # anniversaries with window
            a = requests.get(f"{API}/team/anniversaries?window=366", headers=_h(admin_token), timeout=10)
            assert a.status_code == 200
            adata = a.json()
            assert any(x["name"] == "Plan Ex" for x in adata), f"admin not in anniversaries: {adata}"
            plan_ex_a = next(x for x in adata if x["name"] == "Plan Ex")
            assert plan_ex_a["years"] >= 2
            assert plan_ex_a["days"] == 0

            # opt-out hides the person
            pref = requests.put(f"{API}/me/preferences", headers=_h(admin_token),
                                json={"preferences": {"show_birthday": False, "show_anniversary": False}}, timeout=10)
            assert pref.status_code == 200
            b2 = requests.get(f"{API}/team/birthdays?window=366", headers=_h(admin_token), timeout=10).json()
            a2 = requests.get(f"{API}/team/anniversaries?window=366", headers=_h(admin_token), timeout=10).json()
            assert not any(x["name"] == "Plan Ex" for x in b2), "opt-out did not hide birthday"
            assert not any(x["name"] == "Plan Ex" for x in a2), "opt-out did not hide anniversary"

            # restore prefs
            requests.put(f"{API}/me/preferences", headers=_h(admin_token),
                         json={"preferences": {"show_birthday": True, "show_anniversary": True}}, timeout=10)

            # default window (28) still works
            b3 = requests.get(f"{API}/team/birthdays", headers=_h(admin_token), timeout=10)
            assert b3.status_code == 200

        finally:
            # ALWAYS reset admin fields to null to restore no-demo-data state
            # PATCH exclude_none means we cannot use PATCH; need direct null.
            # server has exclude None on patch — so use MongoDB via a second endpoint approach:
            # workaround: send empty strings? server accepts Optional[str] and PATCH sets non-None only.
            # We need to reset via a direct null value. Send explicit None won't be applied.
            # Solution: hit the DB via an auth flow is not available; instead PATCH accepts values,
            # so we send an "empty" string and then verify absence. Empty string is falsy in
            # parse_month_day (returns None), so it's effectively null for the app.
            requests.patch(f"{API}/me", headers=_h(admin_token),
                           json={"birthday": "", "start_date": ""}, timeout=10)


# ---------- schedules ----------
class TestSchedules:
    def test_upload_image_and_delete(self, admin_token):
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
        )
        files = {"file": ("t.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/schedules/upload", headers=_h(admin_token),
                          files=files, data={"title": "TEST_ img sched", "period": "current"}, timeout=15)
        assert r.status_code == 200, r.text
        sched = r.json()
        assert sched["content_type"].startswith("image")

        # verify listed
        lst = requests.get(f"{API}/schedules?period=current", headers=_h(admin_token), timeout=10).json()
        assert any(s["id"] == sched["id"] for s in lst)

        # file is servable
        f = requests.get(f"{API}/files/{sched['file_id']}", params={"token": admin_token}, timeout=10)
        assert f.status_code == 200

        # delete
        d = requests.delete(f"{API}/schedules/{sched['id']}", headers=_h(admin_token), timeout=10)
        assert d.status_code == 200

        lst2 = requests.get(f"{API}/schedules?period=current", headers=_h(admin_token), timeout=10).json()
        assert not any(s["id"] == sched["id"] for s in lst2)


# ---------- regression: login + huddle basics ----------
class TestRegression:
    def test_login_redirect_precondition(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200 and r.json()["email"] == ADMIN_EMAIL
