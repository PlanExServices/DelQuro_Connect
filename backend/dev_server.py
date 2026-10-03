"""Local development server for DelQuro Connect.

Runs the real FastAPI app from ``server.py`` without requiring a MongoDB
installation by swapping motor's client for an in-memory implementation
(``mongomock-motor``, see ``requirements-dev.txt``).

Usage
-----
    # in-memory database + demo data (handy for a quick look at the UI)
    IN_MEMORY_DB=1 SEED_DEMO=1 python dev_server.py

    # in-memory database, empty workspace (use /setup + ADMIN_BOOTSTRAP_CODE)
    IN_MEMORY_DB=1 python dev_server.py

    # normal mode: talk to the MongoDB from backend/.env like production
    python dev_server.py

Environment:
    PORT            port to listen on (default 8000)
    IN_MEMORY_DB    "1" to use the in-memory MongoDB stand-in
    SEED_DEMO       "1" to insert demo users/content (in-memory mode only)
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

PORT = int(os.environ.get("PORT", "8000"))
IN_MEMORY = os.environ.get("IN_MEMORY_DB") == "1"

if IN_MEMORY:
    # Must happen before importing server.py, which does
    # `from motor.motor_asyncio import AsyncIOMotorClient`.
    import mongomock_motor
    from motor import motor_asyncio

    motor_asyncio.AsyncIOMotorClient = mongomock_motor.AsyncMongoMockClient
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "delquro_connect_dev")
    os.environ.setdefault("JWT_SECRET", "dev-only-in-memory-secret")
    os.environ.setdefault("ADMIN_BOOTSTRAP_CODE", "DELQURO-SETUP-2026")

import server  # noqa: E402  (imported after the motor patch)
from auth import hash_password  # noqa: E402

DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Delquro2026")

DEMO_USERS = [
    ("Eleanor Vance", "eleanor@delquroconnect.com", "admin", "Veterinarian", "CAH Main Campus"),
    ("Cody Martinez", "cody@delquroconnect.com", "manager", "Practice Manager", "CAH Main Campus"),
    ("Alice Chen", "alice@delquroconnect.com", "staff", "Veterinary Technician", "CAH Main Campus"),
    ("Marcus Green", "marcus@delquroconnect.com", "staff", "Veterinary Technician", "CAH Main Campus"),
    ("Sophia Taylor", "sophia@delquroconnect.com", "staff", "Receptionist", "North Urgent Care"),
    ("Jordan Miller", "jordan@delquroconnect.com", "staff", "Vet Assistant", "North Urgent Care"),
]


async def seed_demo() -> None:
    db = server.db
    if await db.users.count_documents({}) > 0:
        print("[seed] users already present — skipping demo seed")
        return

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    ids = {}
    for name, email, role, job_title, campus in DEMO_USERS:
        doc = {
            "email": email,
            "password_hash": hash_password(DEMO_PASSWORD),
            "name": name,
            "initials": server.initials_of(name),
            "campus": campus,
            "role": role,
            "job_title": job_title,
            "birthday": None,
            "start_date": None,
            "location_id": None,
            "kudos": 0,
            "preferences": dict(server.DEFAULT_PREFERENCES),
            "created_at": now.isoformat(),
        }
        ids[name] = str((await db.users.insert_one(doc)).inserted_id)

    await db.posts.insert_one({
        "author_id": ids["Eleanor Vance"],
        "author_name": "Eleanor Vance",
        "author_initials": "EV",
        "title": "Antibiotic stewardship reminder",
        "content": "Please double-check culture results before starting broad-spectrum antibiotics. "
                   "The pinned protocol on the Huddle board walks through the new checklist.",
        "image_id": None, "likes": [], "created_at": now.isoformat(),
    })
    await db.posts.insert_one({
        "author_id": ids["Cody Martinez"],
        "author_name": "Cody Martinez",
        "author_initials": "CM",
        "title": "Schedule posted",
        "content": "The floor + surgery schedule for next week is up under the Schedule tab.",
        "image_id": None, "likes": [], "created_at": now.isoformat(),
    })

    chat = {
        "name": "general", "description": "Hospital-wide chat", "access": "staff",
        "is_everyone": True, "member_ids": [],
        "creator_id": ids["Eleanor Vance"], "created_at": now.isoformat(),
    }
    chat_id = str((await db.chats.insert_one(chat)).inserted_id)
    await db.messages.insert_one({
        "chat_id": chat_id, "sender_id": ids["Alice Chen"], "sender_name": "Alice Chen",
        "sender_initials": "AC", "text": "Morning team — ICU is full, two cages free in recovery.",
        "image_id": None, "read_by": [ids["Alice Chen"]], "created_at": now.isoformat(),
    })
    await db.messages.insert_one({
        "chat_id": chat_id, "sender_id": ids["Marcus Green"], "sender_name": "Marcus Green",
        "sender_initials": "MG", "text": "Thanks Alice — I'll take the 10am intake.",
        "image_id": None, "read_by": [ids["Marcus Green"]], "created_at": now.isoformat(),
    })

    await db.timeoff.insert_one({
        "user_id": ids["Sophia Taylor"], "name": "Sophia Taylor", "initials": "ST",
        "date": today, "reason": "Family appointment", "status": "pending",
        "created_at": now.isoformat(),
    })
    await db.timeoff.insert_one({
        "user_id": ids["Jordan Miller"], "name": "Jordan Miller", "initials": "JM",
        "date": today, "reason": "Conference", "status": "approved",
        "created_at": now.isoformat(),
    })

    await db.kudos.insert_one({
        "from_id": ids["Eleanor Vance"], "from_name": "Eleanor Vance", "from_initials": "EV",
        "to_id": ids["Alice Chen"], "to_name": "Alice Chen", "to_initials": "AC",
        "message": "Calm and precise during a very busy surgery morning.",
        "created_at": now.isoformat(),
    })
    await db.users.update_one({"_id": server.ObjectId(ids["Alice Chen"])}, {"$inc": {"kudos": 1}})

    print(f"[seed] demo data ready — sign in as eleanor@delquroconnect.com / {DEMO_PASSWORD}")


if IN_MEMORY and os.environ.get("SEED_DEMO") == "1":
    # Seeding runs on the server's own event loop, right after the app's
    # startup handlers (index creation) have run.
    server.app.add_event_handler("startup", seed_demo)


if __name__ == "__main__":
    import uvicorn

    print(
        f"[dev] starting on http://0.0.0.0:{PORT} "
        f"({'in-memory mongodb' if IN_MEMORY else os.environ.get('MONGO_URL')})"
    )
    uvicorn.run(server.app, host="0.0.0.0", port=PORT, log_level="info")
