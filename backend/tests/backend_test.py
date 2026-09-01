"""Backend API tests for Delquro Connect."""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "https://hospital-sync-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "planexservices@gmail.com"
ADMIN_PASS = "Delquro2026"
STAFF_EMAIL = "sam@hospital.com"
STAFF_PASS = "Vetteam1"
MANAGER_EMAIL = "maria@hospital.com"
MANAGER_PASS = "Vetteam1"


# ---------- session helpers ----------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="session")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASS)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def staff_token():
    r = _login(STAFF_EMAIL, STAFF_PASS)
    if r.status_code != 200:
        pytest.skip(f"staff login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def manager_token():
    r = _login(MANAGER_EMAIL, MANAGER_PASS)
    if r.status_code != 200:
        pytest.skip(f"manager login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ================== AUTH ==================
class TestAuth:
    def test_auth_status(self):
        r = requests.get(f"{API}/auth/status", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"needs_setup": False}

    def test_login_admin(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        u = data["user"]
        assert u["role"] == "admin"
        assert u["permissions"]["manage_roles"] is True
        assert u["permissions"]["post_huddle"] is True

    def test_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_register_staff_no_code(self):
        email = f"test_{uuid.uuid4().hex[:10]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd123", "name": "Test User"
        }, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["role"] == "staff"
        perms = u["permissions"]
        assert perms["post_huddle"] is False
        assert perms["manage_roles"] is False
        assert perms["approve_timeoff"] is False

    def test_register_with_invite_code(self, admin_token):
        # create invite as admin
        inv = requests.post(f"{API}/invites", headers=_h(admin_token), json={
            "channel": "email", "value": "x@y.com", "campus": "Downtown",
            "job_title": "Receptionist", "access": "manager",
        }, timeout=15)
        assert inv.status_code == 200, inv.text
        code = inv.json()["code"]

        email = f"invite_{uuid.uuid4().hex[:10]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd123", "name": "Invited User", "code": code,
        }, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["role"] == "manager"
        assert u["campus"] == "Downtown"
        assert u["job_title"] == "Receptionist"

    def test_brute_force_lockout(self):
        email = f"lock_{uuid.uuid4().hex[:6]}@example.com"
        last = None
        for _ in range(7):
            last = requests.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass1"}, timeout=10)
        assert last.status_code == 429, f"expected 429 got {last.status_code}"


# ================== HUDDLE ==================
class TestHuddle:
    def test_list_posts(self, admin_token):
        r = requests.get(f"{API}/posts", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_create_post(self, admin_token):
        r = requests.post(f"{API}/posts", headers=_h(admin_token), json={
            "content": "TEST_ hello team", "title": "TEST_ Announcement",
        }, timeout=10)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["content"] == "TEST_ hello team"
        assert "id" in p
        pytest.post_id = p["id"]

    def test_staff_create_post_403(self, staff_token):
        r = requests.post(f"{API}/posts", headers=_h(staff_token), json={"content": "nope"}, timeout=10)
        assert r.status_code == 403

    def test_like_toggle(self, staff_token):
        pid = getattr(pytest, "post_id", None)
        assert pid, "post_id missing"
        r1 = requests.post(f"{API}/posts/{pid}/like", headers=_h(staff_token), timeout=10)
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["liked"] is True and d1["like_count"] >= 1
        r2 = requests.post(f"{API}/posts/{pid}/like", headers=_h(staff_token), timeout=10)
        assert r2.json()["liked"] is False

    def test_comments(self, staff_token, admin_token):
        pid = pytest.post_id
        c = requests.post(f"{API}/posts/{pid}/comments", headers=_h(staff_token), json={"text": "TEST_ nice"}, timeout=10)
        assert c.status_code == 200
        lst = requests.get(f"{API}/posts/{pid}/comments", headers=_h(admin_token), timeout=10)
        assert lst.status_code == 200
        assert any(x["text"] == "TEST_ nice" for x in lst.json())

    def test_author_only_delete(self, staff_token, admin_token):
        pid = pytest.post_id
        # staff cannot delete admin's post
        r = requests.delete(f"{API}/posts/{pid}", headers=_h(staff_token), timeout=10)
        assert r.status_code == 403
        r2 = requests.delete(f"{API}/posts/{pid}", headers=_h(admin_token), timeout=10)
        assert r2.status_code == 200


# ================== TIME OFF ==================
class TestTimeOff:
    def test_staff_request_forces_pending(self, staff_token):
        r = requests.post(f"{API}/timeoff", headers=_h(staff_token), json={
            "date": "2027-06-15", "reason": "TEST_ vacation", "status": "approved"
        }, timeout=10)
        assert r.status_code == 200
        t = r.json()
        assert t["status"] == "pending"
        pytest.timeoff_id = t["id"]

    def test_admin_approve(self, admin_token):
        tid = pytest.timeoff_id
        r = requests.put(f"{API}/timeoff/{tid}/status", headers=_h(admin_token),
                         params={"status": "approved"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

    def test_daylimit_get(self, admin_token):
        r = requests.get(f"{API}/daylimit", headers=_h(admin_token), params={"date": "2027-06-15"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("date", "limit", "approved", "remaining"):
            assert k in d
        assert d["approved"] >= 1

    def test_daylimit_set_requires_perm(self, staff_token, admin_token):
        r = requests.put(f"{API}/daylimit", headers=_h(staff_token),
                         json={"date": "2027-06-15", "limit": 5}, timeout=10)
        assert r.status_code == 403
        r2 = requests.put(f"{API}/daylimit", headers=_h(admin_token),
                          json={"date": "2027-06-15", "limit": 5}, timeout=10)
        assert r2.status_code == 200 and r2.json()["limit"] == 5


# ================== SCHEDULES / FILES ==================
class TestSchedules:
    def test_upload_requires_manage(self, staff_token):
        files = {"file": ("s.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/schedules/upload", headers=_h(staff_token),
                          files=files, data={"title": "TEST_", "period": "current"}, timeout=15)
        assert r.status_code == 403

    def test_admin_upload_and_serve(self, admin_token):
        files = {"file": ("s.txt", io.BytesIO(b"scheduledata"), "text/plain")}
        r = requests.post(f"{API}/schedules/upload", headers=_h(admin_token),
                          files=files, data={"title": "TEST_ sched", "period": "current"}, timeout=15)
        assert r.status_code == 200, r.text
        sched = r.json()
        assert sched["file_id"]

        lst = requests.get(f"{API}/schedules", headers=_h(admin_token), params={"period": "current"}, timeout=10)
        assert lst.status_code == 200
        assert any(s["id"] == sched["id"] for s in lst.json())

        f = requests.get(f"{API}/files/{sched['file_id']}", params={"token": admin_token}, timeout=10)
        assert f.status_code == 200
        assert f.content == b"scheduledata"


class TestUpload:
    def test_upload_and_fetch(self, admin_token):
        files = {"file": ("x.png", io.BytesIO(b"pngbytes"), "image/png")}
        r = requests.post(f"{API}/upload", headers=_h(admin_token), files=files, timeout=15)
        assert r.status_code == 200
        fid = r.json()["id"]
        f = requests.get(f"{API}/files/{fid}", params={"token": admin_token}, timeout=10)
        assert f.status_code == 200
        assert f.content == b"pngbytes"


# ================== CHAT ==================
class TestChat:
    def test_list_chats(self, staff_token):
        r = requests.get(f"{API}/chats", headers=_h(staff_token), timeout=10)
        assert r.status_code == 200
        chats = r.json()
        assert any(c.get("is_everyone") for c in chats), "no everyone chat"
        pytest.everyone_chat_id = next(c["id"] for c in chats if c.get("is_everyone"))

    def test_send_message_text(self, staff_token):
        cid = pytest.everyone_chat_id
        r = requests.post(f"{API}/chats/{cid}/messages", headers=_h(staff_token),
                          json={"text": "TEST_ hi"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["text"] == "TEST_ hi"

    def test_send_message_image(self, staff_token, admin_token):
        # first upload an image
        files = {"file": ("i.png", io.BytesIO(b"img"), "image/png")}
        up = requests.post(f"{API}/upload", headers=_h(admin_token), files=files, timeout=10)
        img_id = up.json()["id"]
        cid = pytest.everyone_chat_id
        r = requests.post(f"{API}/chats/{cid}/messages", headers=_h(staff_token),
                          json={"image_id": img_id}, timeout=10)
        assert r.status_code == 200
        assert r.json()["image_id"] == img_id

    def test_list_messages(self, staff_token):
        cid = pytest.everyone_chat_id
        r = requests.get(f"{API}/chats/{cid}/messages", headers=_h(staff_token), timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_mark_read(self, admin_token):
        cid = pytest.everyone_chat_id
        r = requests.post(f"{API}/chats/{cid}/read", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200

    def test_custom_group_403_non_member(self, admin_token, staff_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token)).json()
        r = requests.post(f"{API}/chats", headers=_h(admin_token), json={
            "name": "TEST_ private", "is_everyone": False, "member_ids": [me["id"]],
        }, timeout=10)
        assert r.status_code == 200
        cid = r.json()["id"]
        m = requests.get(f"{API}/chats/{cid}/messages", headers=_h(staff_token), timeout=10)
        assert m.status_code == 403
        p = requests.post(f"{API}/chats/{cid}/messages", headers=_h(staff_token),
                          json={"text": "x"}, timeout=10)
        assert p.status_code == 403


# ================== KUDOS / ACHIEVEMENTS ==================
class TestKudos:
    def test_self_kudos_400(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token)).json()
        r = requests.post(f"{API}/kudos", headers=_h(admin_token),
                          json={"to_id": me["id"], "message": "self"}, timeout=10)
        assert r.status_code == 400

    def test_give_kudos_increments(self, admin_token, staff_token):
        staff_me = requests.get(f"{API}/auth/me", headers=_h(staff_token)).json()
        before = staff_me.get("kudos", 0)
        r = requests.post(f"{API}/kudos", headers=_h(admin_token),
                          json={"to_id": staff_me["id"], "message": "TEST_ nice job"}, timeout=10)
        assert r.status_code == 200
        after = requests.get(f"{API}/auth/me", headers=_h(staff_token)).json()["kudos"]
        assert after == before + 1

    def test_achievements(self, staff_token):
        r = requests.get(f"{API}/achievements", headers=_h(staff_token), timeout=10)
        assert r.status_code == 200
        board = r.json()
        assert board and "badge" in board[0]

    def test_kudos_feed(self, staff_token):
        r = requests.get(f"{API}/kudos", headers=_h(staff_token), timeout=10)
        assert r.status_code == 200


# ================== ADMIN ==================
class TestAdmin:
    def test_stats_requires_admin(self, staff_token, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_h(staff_token), timeout=10)
        assert r.status_code == 403
        r2 = requests.get(f"{API}/admin/stats", headers=_h(admin_token), timeout=10)
        assert r2.status_code == 200
        for k in ("total_staff", "pending_timeoff", "active_chats", "schedules", "posts"):
            assert k in r2.json()

    def test_locations_crud(self, admin_token, staff_token):
        r = requests.post(f"{API}/locations", headers=_h(staff_token),
                          json={"name": "TEST_X", "campus_code": "TX"}, timeout=10)
        assert r.status_code == 403
        r2 = requests.post(f"{API}/locations", headers=_h(admin_token),
                           json={"name": "TEST_Loc", "campus_code": "TL"}, timeout=10)
        assert r2.status_code == 200
        lst = requests.get(f"{API}/locations", headers=_h(admin_token), timeout=10)
        assert lst.status_code == 200

    def test_role_keeps_at_least_one_admin(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token)).json()
        # Try to demote the only admin -> should 400
        r = requests.put(f"{API}/team/{me['id']}/role", headers=_h(admin_token),
                         params={"role": "staff"}, timeout=10)
        assert r.status_code == 400

    def test_set_role_and_location(self, admin_token, staff_token):
        staff_me = requests.get(f"{API}/auth/me", headers=_h(staff_token)).json()
        # promote and revert
        r = requests.put(f"{API}/team/{staff_me['id']}/role", headers=_h(admin_token),
                         params={"role": "manager"}, timeout=10)
        assert r.status_code == 200 and r.json()["role"] == "manager"
        r2 = requests.put(f"{API}/team/{staff_me['id']}/role", headers=_h(admin_token),
                          params={"role": "staff"}, timeout=10)
        assert r2.status_code == 200 and r2.json()["role"] == "staff"

        locs = requests.get(f"{API}/locations", headers=_h(admin_token)).json()
        if locs:
            lid = locs[0]["id"]
            r3 = requests.put(f"{API}/team/{staff_me['id']}/location", headers=_h(admin_token),
                              params={"location_id": lid}, timeout=10)
            assert r3.status_code == 200


# ================== INVITES ==================
class TestInvites:
    def test_invite_perm(self, staff_token):
        r = requests.post(f"{API}/invites", headers=_h(staff_token),
                          json={"channel": "email", "access": "staff"}, timeout=10)
        assert r.status_code == 403
        r2 = requests.get(f"{API}/invites", headers=_h(staff_token), timeout=10)
        assert r2.status_code == 403

    def test_invite_flow(self, admin_token):
        r = requests.post(f"{API}/invites", headers=_h(admin_token),
                          json={"channel": "email", "value": "a@b.com", "access": "staff"}, timeout=10)
        assert r.status_code == 200
        iid = r.json()["id"]
        lst = requests.get(f"{API}/invites", headers=_h(admin_token), timeout=10)
        assert lst.status_code == 200
        assert any(i["id"] == iid for i in lst.json())
        d = requests.delete(f"{API}/invites/{iid}", headers=_h(admin_token), timeout=10)
        assert d.status_code == 200
