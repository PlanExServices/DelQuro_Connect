"""Self-contained security regression tests (no running server or MongoDB needed).

Runs the real FastAPI app in-process against mongomock-motor:
    pip install -r backend/requirements-dev.txt httpx
    cd backend && python -m pytest tests/test_security.py -n 0
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mongomock_motor  # noqa: E402
from motor import motor_asyncio  # noqa: E402

motor_asyncio.AsyncIOMotorClient = mongomock_motor.AsyncMongoMockClient
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "delquro_security_tests"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-characters-long"
os.environ["ADMIN_BOOTSTRAP_CODE"] = "private-test-setup-code"
os.environ.pop("ALLOW_OPEN_REGISTRATION", None)

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402

PW = "Passw0rd123"


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


@pytest.fixture(scope="module")
def admin(client):
    r = client.post("/api/auth/register", json={
        "email": "admin@example.com", "password": PW, "name": "Ada Admin",
        "bootstrap_code": "private-test-setup-code",
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def invite(client, tok, access="staff"):
    r = client.post("/api/invites", headers=h(tok), json={"channel": "code", "access": access})
    assert r.status_code == 200, r.text
    return r.json()["code"]


def join(client, code, email, name="Someone"):
    r = client.post("/api/auth/register", json={"email": email, "password": PW, "name": name, "code": code})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def manager(client, admin):
    return join(client, invite(client, admin, "manager"), "manager@example.com", "Max Manager")


@pytest.fixture(scope="module")
def staff(client, admin):
    return join(client, invite(client, admin), "staff@example.com", "Sam Staff")


def test_published_bootstrap_code_is_refused(client, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_CODE", "DELQURO-SETUP-2026")
    r = client.post("/api/auth/register", json={
        "email": "x@example.com", "password": PW, "name": "X", "bootstrap_code": "DELQURO-SETUP-2026",
    })
    assert r.status_code == 400
    assert server.db is not None


def test_register_without_invite_is_refused(client, admin):
    r = client.post("/api/auth/register", json={"email": "stranger@example.com", "password": PW, "name": "Stranger"})
    assert r.status_code == 400
    assert "invite" in r.json()["detail"].lower()


def test_open_registration_can_be_enabled(client, admin, monkeypatch):
    monkeypatch.setattr(server, "ALLOW_OPEN_REGISTRATION", True)
    r = client.post("/api/auth/register", json={"email": "open@example.com", "password": PW, "name": "Open"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "staff"


def test_invite_code_is_single_use(client, admin):
    code = invite(client, admin)
    join(client, code, "first@example.com")
    r = client.post("/api/auth/register", json={"email": "second@example.com", "password": PW, "name": "B", "code": code})
    assert r.status_code == 400


def test_manager_cannot_invite_admins_or_managers(client, manager):
    for access in ("admin", "manager"):
        r = client.post("/api/invites", headers=h(manager), json={"channel": "code", "access": access})
        assert r.status_code == 403, access
    invite(client, manager, "staff")


def test_password_change_revokes_old_tokens(client, admin):
    tok = join(client, invite(client, admin), "rotate@example.com")
    r = client.post("/api/me/password", headers=h(tok), json={"current_password": PW, "new_password": "N3wPassword"})
    assert r.status_code == 200
    new_tok = r.json()["access_token"]
    assert client.get("/api/auth/me", headers=h(tok)).status_code == 401
    assert client.get("/api/auth/me", headers=h(new_tok)).status_code == 200


def test_uploaded_html_is_not_served_inline(client, staff):
    r = client.post("/api/upload", headers=h(staff),
                    files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")})
    fid = r.json()["id"]
    r = client.get(f"/api/files/{fid}?token={staff}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/octet-stream")
    assert r.headers["content-disposition"].startswith("attachment")
    assert "sandbox" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff"


def test_images_are_still_served_inline(client, staff):
    r = client.post("/api/upload", headers=h(staff),
                    files={"file": ("pic.png", b"\x89PNG\r\n\x1a\n", "image/png")})
    r = client.get(f"/api/files/{r.json()['id']}", headers=h(staff))
    assert r.headers["content-type"] == "image/png"
    assert r.headers["content-disposition"].startswith("inline")


def test_hidden_birthday_not_in_directory(client, admin, staff):
    client.patch("/api/me", headers=h(staff), json={"birthday": "04-12"})
    client.put("/api/me/preferences", headers=h(staff), json={"preferences": {"show_birthday": False}})
    members = client.get("/api/team/members", headers=h(admin)).json()
    sam = next(m for m in members if m["email"] == "staff@example.com")
    assert sam["birthday"] is None
    me = next(m for m in client.get("/api/team/members", headers=h(staff)).json() if m["email"] == "staff@example.com")
    assert me["birthday"] == "04-12"


def test_mark_read_requires_chat_access(client, admin, staff):
    r = client.post("/api/chats", headers=h(admin), json={"name": "Private", "member_ids": []})
    cid = r.json()["id"]
    assert client.post(f"/api/chats/{cid}/read", headers=h(staff)).status_code == 403


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
