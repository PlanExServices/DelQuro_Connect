"""Run directly to verify invite-only registration against an in-memory database."""

import asyncio
import os
import sys
from pathlib import Path

import mongomock_motor
from fastapi import HTTPException
from motor import motor_asyncio

motor_asyncio.AsyncIOMotorClient = mongomock_motor.AsyncMongoMockClient
os.environ.update(
    MONGO_URL="mongodb://localhost:27017",
    DB_NAME="registration_gate_smoke",
    JWT_SECRET="local-registration-test-secret-32-characters",
    ADMIN_BOOTSTRAP_CODE="LOCAL-SETUP-ONLY",
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402


async def expect_error(body: dict, status: int) -> None:
    try:
        await server.register(server.RegisterBody(**body))
    except HTTPException as exc:
        assert exc.status_code == status, (exc.status_code, exc.detail)
    else:
        raise AssertionError(f"Expected HTTP {status}")


async def main() -> None:
    print("Starting registration checks", flush=True)
    base = {"name": "Release Test", "email": "release@example.com", "password": "StrongPass123"}
    await expect_error(base, 400)
    os.environ["ADMIN_BOOTSTRAP_CODE"] = "DELQURO-SETUP-2026"
    await expect_error({**base, "bootstrap_code": "DELQURO-SETUP-2026"}, 503)
    os.environ["ADMIN_BOOTSTRAP_CODE"] = "LOCAL-SETUP-ONLY"
    bootstrap = await server.register(server.RegisterBody(**base, bootstrap_code="LOCAL-SETUP-ONLY"))
    assert bootstrap["user"]["role"] == "admin"
    await expect_error({**base, "email": "noinvite@example.com"}, 400)
    await expect_error({**base, "email": "badinvite@example.com", "code": "BADBAD"}, 400)

    admin = await server.db.users.find_one({"email": base["email"]})
    invite = await server.create_invite(
        server.InviteBody(channel="email", value="staff@example.com", access="staff"), admin
    )
    staff = await server.register(
        server.RegisterBody(**{**base, "email": "staff@example.com", "code": f" {invite['code'].lower()} "})
    )
    assert staff["user"]["role"] == "staff"
    await expect_error({**base, "email": "second@example.com", "code": invite["code"]}, 400)
    print("Registration gate passed: setup, invite, no-code, invalid-code, reused-code")


if __name__ == "__main__":
    asyncio.run(main())
