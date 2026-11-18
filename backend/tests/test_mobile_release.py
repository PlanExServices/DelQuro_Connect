import asyncio
import importlib

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient


PASSWORD = "SyntheticMobile42"


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def site(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    monkeypatch.setenv("DB_NAME", "synthetic_mobile_release")
    monkeypatch.setenv("JWT_SECRET", "synthetic-mobile-tests-do-not-use-in-production")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_CODE", "synthetic-invitation-test")
    server = importlib.import_module("server")
    database = AsyncMongoMockClient().synthetic_mobile_release
    monkeypatch.setattr(server, "db", database)
    with TestClient(server.app) as client:
        yield client, database


def admin_and_staff(client):
    register = client.post("/api/auth/register", json={
        "email": "admin@example.net", "name": "Test Admin", "password": PASSWORD,
        "bootstrap_code": "synthetic-invitation-test",
    })
    assert register.status_code == 200, register.text
    admin = bearer(register.json()["access_token"])
    invite = client.post("/api/invites", headers=admin, json={"channel": "code", "access": "staff"})
    assert invite.status_code == 200, invite.text
    response = client.post("/api/mobile/auth/register", json={
        "email": "staff@example.net", "name": "Test Teammate", "password": PASSWORD,
        "code": invite.json()["code"], "community_terms_accepted": True,
    })
    assert response.status_code == 200, response.text
    return admin, response.json()


def mobile_login(client, email):
    response = client.post("/api/mobile/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()


def test_invitation_device_rotation_and_revocation(site):
    client, db = site
    rejected = client.post("/api/mobile/auth/register", json={
        "email": "stranger@example.net", "password": PASSWORD, "name": "Stranger", "code": "WRONG",
        "bootstrap_code": "synthetic-invitation-test", "community_terms_accepted": True,
    })
    assert rejected.status_code == 400
    admin, session = admin_and_staff(client)
    assert session["user"]["role"] == "staff"
    assert session["user"]["community_terms_accepted"] is True
    assert client.get("/api/auth/me", headers=bearer(session["access_token"])).status_code == 200
    assert client.get("/api/auth/me", params={"token": session["access_token"]}).status_code == 401

    first = {"refresh_token": session["refresh_token"]}
    refresh = client.post("/api/mobile/auth/refresh", json=first)
    assert refresh.status_code == 200, refresh.text
    next_session = refresh.json()
    record = asyncio.run(db.mobile_sessions.find_one({}))
    assert "refresh_token" not in record
    assert next_session["refresh_token"] != first["refresh_token"]
    assert client.post("/api/mobile/auth/refresh", json=first).status_code == 401
    assert client.post("/api/mobile/auth/logout", json={"refresh_token": next_session["refresh_token"]}).status_code == 200
    assert client.get("/api/auth/me", headers=bearer(next_session["access_token"])).status_code == 401
    assert client.get("/api/auth/me", headers=admin).status_code == 200


def test_native_attachment_authorization_terms_and_moderation(site):
    client, _ = site
    admin, staff = admin_and_staff(client)
    employee = bearer(staff["access_token"])
    native_admin = bearer(mobile_login(client, "admin@example.net")["access_token"])
    room = client.post("/api/chats", headers=employee, json={"name": "Team", "is_everyone": True}).json()
    messages = f"/api/chats/{room['id']}/messages"
    assert client.post(messages, headers=native_admin, json={"text": "Hello team"}).status_code == 403
    assert client.post("/api/mobile/community/accept", headers=native_admin).status_code == 200
    assert client.post(messages, headers=native_admin, json={"text": "Hello team"}).status_code == 200
    assert client.post(messages, headers=employee, json={"text": "I will kill you"}).status_code == 400

    attachment = client.post("/api/upload", headers=employee, files={"file": ("sample.png", b"fixture", "image/png")})
    assert attachment.status_code == 200
    attachment_id = attachment.json()["id"]
    file_url = f"/api/files/{attachment_id}"
    assert client.get(file_url, headers=admin).status_code == 404
    message = client.post(messages, headers=employee, json={"text": "Please review", "image_id": attachment_id}).json()
    assert client.get(file_url, headers=native_admin).content == b"fixture"

    report = {"kind": "message", "target_id": message["id"], "reason": "other"}
    for _ in range(2):
        assert client.post("/api/reports", headers=native_admin, json=report).status_code == 201
    assert client.get("/api/moderation/reports", headers=employee).status_code == 403
    reports = client.get("/api/moderation/reports", headers=admin).json()
    assert len(reports) == 1 and reports[0]["attachment_available"]
    report_url = f"/api/moderation/reports/{reports[0]['id']}"
    assert client.get(f"{report_url}/attachment", headers=admin).content == b"fixture"

    block = f"/api/me/blocked-members/{staff['user']['id']}"
    assert client.put(block, headers=native_admin).status_code == 200
    assert [item["text"] for item in client.get(messages, headers=native_admin).json()] == ["Hello team"]
    assert client.get(file_url, headers=native_admin).status_code == 404
    assert client.delete(block, headers=native_admin).status_code == 200
    assert client.post(report_url, headers=admin, json={"action": "remove"}).status_code == 200
    assert client.get(file_url, headers=employee).status_code == 404
    assert client.get(messages, headers=employee).json()[0]["text"] == "Hello team"

    private = client.post("/api/chats", headers=employee, json={"name": "Private"}).json()
    private_path = f"/api/chats/{private['id']}"
    sent = client.post(f"{private_path}/messages", headers=employee, json={"text": "Private chat"}).json()
    assert client.post(f"{private_path}/read", headers=native_admin).status_code == 403
    assert client.post("/api/reports", headers=native_admin, json={
        "kind": "message", "target_id": sent["id"], "reason": "other",
    }).status_code == 404


def test_deletion_removes_authored_data_and_preserves_shared_records(site):
    client, db = site
    admin, staff = admin_and_staff(client)
    employee = bearer(staff["access_token"])
    uid = staff["user"]["id"]

    async def seed_legacy_data():
        file = await db.files.insert_one({"content": b"fixture", "content_type": "image/png"})
        post = await db.posts.insert_one({"author_id": uid, "image_id": str(file.inserted_id)})
        await db.comments.insert_one({"post_id": str(post.inserted_id), "text": "Reply"})
        await db.messages.insert_one({"sender_id": uid, "text": "Work chat"})
        await db.posts.insert_one({"author_id": "another", "likes": [uid], "acknowledged_by": [uid]})
        await db.schedules.insert_one({"title": "Shared schedule", "uploader_id": uid})
        return str(file.inserted_id)

    fid = asyncio.run(seed_legacy_data())
    request = client.post("/api/timeoff", headers=employee, json={"date": "2026-12-01", "reason": "Synthetic"})
    assert request.status_code == 200, request.text
    native_admin = bearer(mobile_login(client, "admin@example.net")["access_token"])
    assert client.get("/api/timeoff/month?year=2026&month=12", headers=native_admin).json() == []
    assert client.request("DELETE", "/api/me", headers=admin, json={"current_password": PASSWORD}).status_code == 400
    assert client.request("DELETE", "/api/me", headers=employee, json={"current_password": "wrong"}).status_code == 400
    deleted = client.request("DELETE", "/api/me", headers=employee, json={"current_password": PASSWORD})
    assert deleted.status_code == 200, deleted.text
    assert client.get("/api/auth/me", headers=employee).status_code == 401
    assert client.post("/api/mobile/auth/refresh", json={"refresh_token": staff["refresh_token"]}).status_code == 401

    async def assert_deleted():
        assert await db.users.find_one({"_id": ObjectId(uid)}) is None
        assert await db.files.find_one({"_id": ObjectId(fid)}) is None
        assert await db.messages.count_documents({"sender_id": uid}) == 0
        assert await db.timeoff.count_documents({"user_id": uid}) == 0
        assert await db.comments.count_documents({}) == 0
        assert await db.posts.count_documents({"acknowledged_by": uid}) == 0
        stored = await db.schedules.find_one({})
        assert stored["title"] == "Shared schedule" and "uploader_id" not in stored

    asyncio.run(assert_deleted())
