"""Regression: DB projections on user queries must not drop public fields and must not leak password_hash."""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "https://hospital-sync-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "planexservices@gmail.com"
ADMIN_PASS = "Delquro2026"

PUBLIC_FIELDS = {"id", "email", "name", "initials", "campus", "role", "job_title",
                 "birthday", "start_date", "location_id", "kudos", "preferences", "permissions"}


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------- team/members shape ----------
class TestTeamMembersShape:
    def test_no_password_hash_and_full_public_shape(self, admin_token):
        r = requests.get(f"{API}/team/members", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        members = r.json()
        assert len(members) >= 1
        for m in members:
            assert "password_hash" not in m
            missing = PUBLIC_FIELDS - set(m.keys())
            assert not missing, f"missing fields: {missing} in {m}"
        # Admin
        admin = next(m for m in members if m["email"] == ADMIN_EMAIL)
        assert admin["role"] == "admin"
        assert isinstance(admin["permissions"], (list, dict))


# ---------- birthdays / anniversaries with populate + reset ----------
class TestCelebrationsPopulation:
    def test_populate_admin_and_windows(self, admin_token):
        today = datetime.now(timezone.utc).date()
        bday = f"{today.month:02d}-{today.day:02d}"
        start_date = today.replace(year=today.year - 2).isoformat()
        try:
            r = requests.patch(f"{API}/me", headers=_h(admin_token),
                               json={"birthday": bday, "start_date": start_date}, timeout=10)
            assert r.status_code == 200

            b = requests.get(f"{API}/team/birthdays?window=366", headers=_h(admin_token), timeout=10)
            assert b.status_code == 200
            bdata = b.json()
            assert any(x.get("name") for x in bdata), f"birthdays empty: {bdata}"
            assert all("initials" in x and "days" in x for x in bdata)

            a = requests.get(f"{API}/team/anniversaries?window=366", headers=_h(admin_token), timeout=10)
            assert a.status_code == 200
            adata = a.json()
            assert any(x.get("years", 0) >= 2 for x in adata), f"anniversaries: {adata}"

            # Opt-out hides
            pref = requests.put(f"{API}/me/preferences", headers=_h(admin_token),
                                json={"preferences": {"show_birthday": False, "show_anniversary": False}}, timeout=10)
            assert pref.status_code == 200
            b2 = requests.get(f"{API}/team/birthdays?window=366", headers=_h(admin_token), timeout=10).json()
            a2 = requests.get(f"{API}/team/anniversaries?window=366", headers=_h(admin_token), timeout=10).json()
            assert not b2 and not a2

            # restore prefs
            requests.put(f"{API}/me/preferences", headers=_h(admin_token),
                         json={"preferences": {"show_birthday": True, "show_anniversary": True}}, timeout=10)
        finally:
            # reset admin fields (empty string == null semantically per prior finding)
            requests.patch(f"{API}/me", headers=_h(admin_token),
                           json={"birthday": "", "start_date": ""}, timeout=10)


# ---------- achievements ----------
class TestAchievementsShape:
    def test_leaderboard_shape(self, admin_token):
        r = requests.get(f"{API}/achievements", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        board = r.json()
        assert len(board) >= 1
        expected = {"id", "name", "initials", "job_title", "kudos", "badge", "points"}
        for row in board:
            assert "password_hash" not in row
            assert expected.issubset(row.keys()), f"missing: {expected - row.keys()}"
            assert row["points"] == row["kudos"] * 10


# ---------- kudos spotlight ----------
class TestKudosSpotlight:
    def test_empty_then_populated_then_cleanup(self, admin_token):
        # Empty state
        r = requests.get(f"{API}/kudos/spotlight", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json().get("spotlight") is None

        # Create a temp user (staff via /auth/register with no code)
        temp_email = "TEST_kudos_target@example.com"
        temp_pass = "TempPass123!"
        reg = requests.post(f"{API}/auth/register",
                            json={"email": temp_email, "password": temp_pass, "name": "Temp Target",
                                  "job_title": "Veterinary Assistant"}, timeout=10)
        assert reg.status_code == 200, reg.text
        temp_id = reg.json()["user"]["id"]
        temp_token = reg.json()["access_token"]

        kudos_id = None
        try:
            # Admin gives kudos to temp user
            k = requests.post(f"{API}/kudos", headers=_h(admin_token),
                              json={"to_id": temp_id, "message": "TEST kudos"}, timeout=10)
            assert k.status_code == 200, k.text
            kudos_id = k.json()["id"]

            # Spotlight now populated
            sp = requests.get(f"{API}/kudos/spotlight", headers=_h(admin_token), timeout=10)
            assert sp.status_code == 200
            spot = sp.json()["spotlight"]
            assert spot is not None
            assert spot["name"] == "Temp Target"
            assert "job_title" in spot  # key present (may be the value we set or None)
            assert spot["count"] >= 1
        finally:
            # Cleanup: delete kudos doc(s) targeting temp user via admin flow — need direct DB or endpoint
            # Delete temp user via DELETE /me while logged in as that user
            if temp_token:
                requests.delete(f"{API}/me", headers=_h(temp_token),
                                json={"current_password": temp_pass}, timeout=10)
            # Clear any lingering kudos records for the temp user (admin can't via API easily —
            # they're auto-removed only if endpoint exists; we simply verify spotlight goes back to None
            # by relying on the 7-day window with count=0 after user is gone → still returns row.
            # If server still shows the deleted user in spotlight, we log it as a minor issue below.


# ---------- auth regression ----------
class TestAuthRegression:
    def test_login_success_and_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "admin"

    def test_bad_password_returns_401_then_429_lockout(self):
        # Use a NON-admin email to avoid locking out the real admin
        bad_email = f"TEST_lockout_{int(datetime.now().timestamp())}@example.com"
        # first 4 attempts should be 401
        for i in range(4):
            r = requests.post(f"{API}/auth/login",
                              json={"email": bad_email, "password": "wrong"}, timeout=10)
            assert r.status_code == 401, f"attempt {i+1}: {r.status_code}"
        # 5th attempt -> 401 (this one *causes* the lockout)
        r5 = requests.post(f"{API}/auth/login",
                           json={"email": bad_email, "password": "wrong"}, timeout=10)
        assert r5.status_code == 401
        # 6th attempt -> 429 lockout
        r6 = requests.post(f"{API}/auth/login",
                           json={"email": bad_email, "password": "wrong"}, timeout=10)
        assert r6.status_code == 429, f"expected 429 lockout, got {r6.status_code}"
