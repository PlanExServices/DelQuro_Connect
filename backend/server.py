import os
import json
import logging
import re
import secrets
import string
from pathlib import Path
from datetime import datetime, timezone, timedelta, date as date_cls
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from bson.binary import Binary
from pydantic import BaseModel, EmailStr, Field, field_validator

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (
    hash_password, verify_password, create_access_token,
    decode_token, token_from_request,
)

def require_env(name: str, default: Optional[str] = None) -> str:
    """Fail fast (with a readable message) instead of raising a bare KeyError."""
    value = os.environ.get(name, default)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable {name!r}. "
            "Set MONGO_URL, DB_NAME and JWT_SECRET before starting the server "
            "(see backend/.env.example)."
        )
    return value


mongo_url = require_env("MONGO_URL")
# Fail fast (5s) instead of hanging each request for motor's 30s default when
# MongoDB is unreachable or MONGO_URL is wrong — deployment problems then show
# up immediately in the logs and in /health/ready.
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[require_env("DB_NAME")]
require_env("JWT_SECRET")  # auth.get_jwt_secret() reads the same variable

app = FastAPI(title="DelQuro Connect API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("delquro")

# MongoDB documents are capped at 16 MB, so reject oversized uploads up front
# with a clear 413 instead of letting the insert blow up with a 500.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

# Login brute-force protection
LOCKOUT_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# Time-off capacity: system default of 2 staff/day (custom overrides 0-8).
SYSTEM_DEFAULT_DAY_LIMIT = 2
MIN_DAY_LIMIT = 0
MAX_DAY_LIMIT = 8


class NormalizePathMiddleware:
    """Collapse duplicate slashes in request paths ("//api/x" → "/api/x").

    Reverse proxies can produce double slashes (e.g. nginx `proxy_pass` when the
    upstream URL ends with "/"). Without this, such requests miss every route
    and return a confusing 404.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket") and "//" in scope.get("path", ""):
            scope = dict(scope)
            scope["path"] = re.sub(r"/{2,}", "/", scope["path"])
        await self.app(scope, receive, send)


def ensure_upload_size(content: bytes) -> None:
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large. The maximum upload size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

# ---------------------------------------------------------------- permissions
MANAGER_PERMS = [
    "post_huddle", "approve_timeoff", "manage_schedules", "set_daylimit",
    "add_approved_timeoff", "invite", "admin_dashboard",
]
ADMIN_ONLY = ["manage_locations", "manage_roles"]
ALL_PERMS = MANAGER_PERMS + ADMIN_ONLY


def compute_permissions(role: str) -> dict:
    perms = {p: False for p in ALL_PERMS}
    if role in ("manager", "admin"):
        for p in MANAGER_PERMS:
            perms[p] = True
    if role == "admin":
        for p in ADMIN_ONLY:
            perms[p] = True
    return perms


def initials_of(name: str) -> str:
    parts = [p for p in (name or "").strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


JOB_TITLES = [
    "Veterinarian", "Veterinary Technician", "Vet Assistant", "Receptionist",
    "Practice Manager", "Kennel Attendant", "Groomer", "Client Care Coordinator",
]
ROLES = ["staff", "manager", "admin"]

DEFAULT_PREFERENCES = {
    "notify_huddle": True,
    "notify_timeoff": True,
    "notify_chat": True,
    "notify_birthdays": True,
    "notify_anniversaries": True,
    "show_birthday": True,
    "show_anniversary": True,
    "compact_mode": False,
}

HOSPITAL_RULES = [
    {"title": "Patient Safety First", "body": "Always confirm patient identity and chart before any procedure. When in doubt, ask a veterinarian. Never leave a sedated patient unattended."},
    {"title": "Client Communication", "body": "Greet every client within 60 seconds of arrival. Return all client calls the same business day. Document every conversation in the patient record."},
    {"title": "Scheduling & Time Off", "body": "Submit time-off requests at least two weeks in advance where possible. Approved days are subject to daily coverage limits set by your manager."},
    {"title": "Cleanliness & Sanitation", "body": "Disinfect exam rooms between every appointment. Kennels are cleaned twice daily. Report any biohazard spill immediately."},
    {"title": "Emergency Protocol", "body": "Triage walk-in emergencies before scheduled appointments. The on-call veterinarian must be notified of any critical case immediately."},
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_month_day(b):
    """Accept 'MM-DD' or legacy 'YYYY-MM-DD'; return (month, day) or None."""
    if not b:
        return None
    parts = str(b).split("-")
    try:
        if len(parts) == 2:
            return int(parts[0]), int(parts[1])
        if len(parts) == 3:
            return int(parts[1]), int(parts[2])
    except (ValueError, IndexError):
        return None
    return None


def gen_code(n: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


# ---------------------------------------------------------------- serializers
def public_user(u: dict) -> dict:
    role = u.get("role", "staff")
    return {
        "id": str(u["_id"]),
        "email": u.get("email"),
        "name": u.get("name"),
        "initials": u.get("initials") or initials_of(u.get("name", "")),
        "campus": u.get("campus"),
        "role": role,
        "job_title": u.get("job_title"),
        "birthday": u.get("birthday"),
        "start_date": u.get("start_date"),
        "location_id": u.get("location_id"),
        "kudos": u.get("kudos", 0),
        "preferences": u.get("preferences", DEFAULT_PREFERENCES),
        "permissions": compute_permissions(role),
    }


# ---------------------------------------------------------------- auth deps
async def get_current_user(request: Request) -> dict:
    token = token_from_request(request)
    payload = decode_token(token)
    try:
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require(perm: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if not compute_permissions(user.get("role", "staff")).get(perm):
            raise HTTPException(status_code=403, detail="You don't have permission to do that")
        return user
    return checker


# ---------------------------------------------------------------- models
class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str
    campus: Optional[str] = None
    job_title: Optional[str] = None
    birthday: Optional[str] = None
    start_date: Optional[str] = None
    code: Optional[str] = None
    bootstrap_code: Optional[str] = None

    @field_validator("password")
    @classmethod
    def strong(cls, v):
        if len(v) < 8 or not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must be at least 8 characters and include a letter and a number")
        return v


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class MeUpdate(BaseModel):
    name: Optional[str] = None
    job_title: Optional[str] = None
    birthday: Optional[str] = None
    start_date: Optional[str] = None

    @field_validator("birthday")
    @classmethod
    def birthday_format(cls, v):
        """'' / None clears the field; otherwise require MM-DD (legacy YYYY-MM-DD ok)."""
        if v is None or not str(v).strip():
            return None
        parts = str(v).strip().split("-")
        try:
            if len(parts) == 2:
                month, day = int(parts[0]), int(parts[1])
            elif len(parts) == 3:
                month, day = int(parts[1]), int(parts[2])
            else:
                raise ValueError
        except ValueError:
            raise ValueError("Birthday must be in MM-DD format")
        try:
            # Year 2000 is a leap year, so 02-29 (leap-day birthdays) is kept.
            date_cls(2000, month, day)
        except ValueError:
            raise ValueError("Birthday must be a valid month and day")
        return f"{month:02d}-{day:02d}"

    @field_validator("start_date")
    @classmethod
    def start_date_format(cls, v):
        if v is None or not str(v).strip():
            return None
        try:
            return datetime.fromisoformat(str(v).strip()).date().isoformat()
        except ValueError:
            raise ValueError("Start date must be in YYYY-MM-DD format")


class PrefsBody(BaseModel):
    preferences: dict


class PasswordBody(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong(cls, v):
        if len(v) < 8 or not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must be at least 8 characters and include a letter and a number")
        return v


class DeleteMeBody(BaseModel):
    current_password: str


class PostBody(BaseModel):
    content: str
    title: Optional[str] = None
    image_id: Optional[str] = None


class CommentBody(BaseModel):
    text: str


class TimeOffBody(BaseModel):
    date: str
    reason: Optional[str] = None
    status: Optional[str] = "pending"


class DayLimitBody(BaseModel):
    date: str
    limit: int = Field(ge=MIN_DAY_LIMIT, le=MAX_DAY_LIMIT)

    @field_validator("date")
    @classmethod
    def date_format(cls, v):
        try:
            return datetime.fromisoformat(str(v).strip()).date().isoformat()
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")


class ChatBody(BaseModel):
    name: str
    description: Optional[str] = None
    access: Optional[str] = "staff"
    is_everyone: bool = False
    member_ids: List[str] = []


class MessageBody(BaseModel):
    text: Optional[str] = None
    image_id: Optional[str] = None


class KudosBody(BaseModel):
    to_id: str
    message: str


class InviteBody(BaseModel):
    channel: str
    value: Optional[str] = None
    campus: Optional[str] = None
    job_title: Optional[str] = None
    access: str = "staff"


class LocationBody(BaseModel):
    name: str
    campus_code: str


# ================================================================ AUTH ROUTES
@api.get("/auth/status")
async def auth_status():
    admin = await db.users.find_one({"role": "admin"})
    return {"needs_setup": admin is None}


async def check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec or rec.get("count", 0) < LOCKOUT_ATTEMPTS:
        return
    locked_until = rec.get("locked_until")
    if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes.",
        )


async def register_fail(identifier: str):
    """Count a failed login. The counter resets once a lockout window expires."""
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"identifier": identifier})
    locked_until = rec.get("locked_until") if rec else None
    expired = True
    if locked_until:
        try:
            expired = datetime.fromisoformat(locked_until) <= now
        except ValueError:
            expired = True
    count = 1 if (not rec or expired) else rec.get("count", 0) + 1
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {
            "$set": {
                "count": count,
                "locked_until": (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat(),
                # Stored as a BSON date (not a string) so the TTL index below
                # actually expires the record.
                "updated_at": now,
            }
        },
        upsert=True,
    )


@api.post("/auth/register")
async def register(body: RegisterBody):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    any_admin = await db.users.find_one({"role": "admin"})
    role = "staff"
    campus = body.campus
    job_title = body.job_title
    location_id = None

    if body.bootstrap_code:
        if any_admin is not None:
            raise HTTPException(status_code=400, detail="Workspace is already set up. Please sign in.")
        if body.bootstrap_code != os.environ.get("ADMIN_BOOTSTRAP_CODE"):
            raise HTTPException(status_code=400, detail="Invalid setup code")
        role = "admin"
    elif body.code:
        invite = await db.invites.find_one({"code": body.code.upper()})
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        if invite.get("expires_at") and datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="This invite code has expired")
        if invite.get("used"):
            raise HTTPException(status_code=400, detail="This invite code has already been used")
        role = invite.get("access", "staff")
        campus = invite.get("campus") or campus
        job_title = invite.get("job_title") or job_title
        location_id = invite.get("location_id")
        await db.invites.update_one({"_id": invite["_id"]}, {"$set": {"used": True, "used_at": now_iso()}})

    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "initials": initials_of(body.name),
        "campus": campus,
        "role": role,
        "job_title": job_title,
        "birthday": body.birthday,
        "start_date": body.start_date,
        "location_id": location_id,
        "kudos": 0,
        "preferences": DEFAULT_PREFERENCES,
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    token = create_access_token(str(res.inserted_id), email)
    return {"access_token": token, "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginBody, request: Request):
    email = body.email.lower()
    identifier = email
    await check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await register_fail(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    token = create_access_token(str(user["_id"]), email)
    return {"access_token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api.patch("/me")
async def update_me(body: MeUpdate, user: dict = Depends(get_current_user)):
    """Only the fields present in the request are touched.

    Sending an explicit null (or "") for `birthday` / `start_date` clears the
    stored value instead of saving an empty string.
    """
    provided = body.model_dump(exclude_unset=True)
    updates, unsets = {}, {}
    for key, value in provided.items():
        if value is None:
            if key in ("birthday", "start_date", "job_title"):
                unsets[key] = ""
            continue
        value = value.strip() if isinstance(value, str) else value
        if value == "":
            if key in ("birthday", "start_date", "job_title"):
                unsets[key] = ""
            continue
        updates[key] = value
    if not updates.get("name") and "name" in provided:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if "name" in updates:
        updates["initials"] = initials_of(updates["name"])
    op = {}
    if updates:
        op["$set"] = updates
    if unsets:
        op["$unset"] = unsets
    if op:
        await db.users.update_one({"_id": user["_id"]}, op)
    fresh = await db.users.find_one({"_id": user["_id"]})
    return public_user(fresh)


@api.put("/me/preferences")
async def update_prefs(body: PrefsBody, user: dict = Depends(get_current_user)):
    merged = {**DEFAULT_PREFERENCES, **user.get("preferences", {}), **body.preferences}
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"preferences": merged}})
    return {"preferences": merged}


@api.post("/me/password")
async def change_password(body: PasswordBody, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


@api.delete("/me")
async def delete_me(body: DeleteMeBody, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    if user.get("role") == "admin":
        other_admin = await db.users.find_one({"role": "admin", "_id": {"$ne": user["_id"]}})
        if not other_admin:
            raise HTTPException(status_code=400, detail="You are the only admin. Assign another admin first.")

    uid = str(user["_id"])
    # Cascade so a deleted account does not linger as a "ghost" in the team
    # feed, the kudos spotlight or the time-off calendar.
    posts = await db.posts.find({"author_id": uid}, {"_id": 1}).to_list(500)
    post_ids = [str(p["_id"]) for p in posts]
    if post_ids:
        await db.comments.delete_many({"post_id": {"$in": post_ids}})
    await db.posts.delete_many({"author_id": uid})
    await db.comments.delete_many({"author_id": uid})
    await db.kudos.delete_many({"$or": [{"to_id": uid}, {"from_id": uid}]})
    await db.timeoff.delete_many({"user_id": uid})
    await db.chats.update_many({"member_ids": uid}, {"$pull": {"member_ids": uid}})
    await db.users.delete_one({"_id": user["_id"]})
    return {"ok": True}


# ================================================================ TEAM / META
@api.get("/team/members")
async def team_members(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"email": 1, "name": 1, "initials": 1, "campus": 1, "role": 1, "job_title": 1, "birthday": 1, "start_date": 1, "location_id": 1, "kudos": 1, "preferences": 1}).to_list(1000)
    return [public_user(u) for u in users]


@api.get("/team/birthdays")
async def birthdays(window: int = 28, user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"name": 1, "initials": 1, "birthday": 1, "preferences": 1}).to_list(1000)
    today = datetime.now(timezone.utc).date()
    out = []
    for u in users:
        if not (u.get("preferences") or {}).get("show_birthday", True):
            continue
        md = parse_month_day(u.get("birthday"))
        if not md:
            continue
        month, day = md
        try:
            nxt = date_cls(today.year, month, day)
        except ValueError:
            continue
        if nxt < today:
            try:
                nxt = date_cls(today.year + 1, month, day)
            except ValueError:
                continue
        days = (nxt - today).days
        if 0 <= days <= window:
            out.append({"name": u.get("name"), "initials": u.get("initials"), "days": days, "date": f"{month:02d}-{day:02d}"})
    out.sort(key=lambda x: x["days"])
    return out


@api.get("/team/anniversaries")
async def anniversaries(window: int = 28, user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"name": 1, "initials": 1, "start_date": 1, "preferences": 1}).to_list(1000)
    today = datetime.now(timezone.utc).date()
    out = []
    for u in users:
        if not (u.get("preferences") or {}).get("show_anniversary", True):
            continue
        s = u.get("start_date")
        if not s:
            continue
        try:
            sd = datetime.fromisoformat(s).date()
        except Exception:
            continue
        try:
            nxt = sd.replace(year=today.year)
        except ValueError:
            nxt = date_cls(today.year, 3, 1)
        if nxt < today:
            try:
                nxt = sd.replace(year=today.year + 1)
            except ValueError:
                nxt = date_cls(today.year + 1, 3, 1)
        days = (nxt - today).days
        years = nxt.year - sd.year
        if 0 <= days <= window and years >= 1:
            out.append({"name": u.get("name"), "initials": u.get("initials"), "label": f"{years} year{'s' if years != 1 else ''}", "years": years, "days": days})
    out.sort(key=lambda x: x["days"])
    return out


@api.get("/meta/job-titles")
async def meta_job_titles(user: dict = Depends(get_current_user)):
    return {"job_titles": JOB_TITLES, "roles": ROLES}


@api.put("/team/{uid}/role")
async def set_role(uid: str, role: str, user: dict = Depends(require("manage_roles"))):
    if role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    target = await db.users.find_one({"_id": ObjectId(uid)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin" and role != "admin":
        others = await db.users.find_one({"role": "admin", "_id": {"$ne": ObjectId(uid)}})
        if not others:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"role": role}})
    fresh = await db.users.find_one({"_id": ObjectId(uid)})
    return public_user(fresh)


@api.put("/team/{uid}/location")
async def set_location(uid: str, location_id: str, user: dict = Depends(require("manage_locations"))):
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"location_id": location_id}})
    fresh = await db.users.find_one({"_id": ObjectId(uid)})
    return public_user(fresh)


# ================================================================ HUDDLE
async def serialize_post(p: dict, user_id: str) -> dict:
    likes = p.get("likes", [])
    comment_count = await db.comments.count_documents({"post_id": str(p["_id"])})
    return {
        "id": str(p["_id"]),
        "author_name": p.get("author_name"),
        "author_initials": p.get("author_initials"),
        "author_id": p.get("author_id"),
        "title": p.get("title"),
        "content": p.get("content"),
        "image_id": p.get("image_id"),
        "like_count": len(likes),
        "liked": user_id in likes,
        "comment_count": comment_count,
        "created_at": p.get("created_at"),
    }


@api.get("/posts")
async def list_posts(user: dict = Depends(get_current_user)):
    posts = await db.posts.find().sort("created_at", -1).to_list(500)
    return [await serialize_post(p, str(user["_id"])) for p in posts]


@api.post("/posts")
async def create_post(body: PostBody, user: dict = Depends(require("post_huddle"))):
    doc = {
        "author_id": str(user["_id"]),
        "author_name": user.get("name"),
        "author_initials": user.get("initials"),
        "title": body.title,
        "content": body.content,
        "image_id": body.image_id,
        "likes": [],
        "created_at": now_iso(),
    }
    res = await db.posts.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await serialize_post(doc, str(user["_id"]))


@api.delete("/posts/{pid}")
async def delete_post(pid: str, user: dict = Depends(get_current_user)):
    p = await db.posts.find_one({"_id": ObjectId(pid)})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    if p.get("author_id") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    await db.posts.delete_one({"_id": ObjectId(pid)})
    await db.comments.delete_many({"post_id": pid})
    return {"ok": True}


@api.post("/posts/{pid}/like")
async def like_post(pid: str, user: dict = Depends(get_current_user)):
    p = await db.posts.find_one({"_id": ObjectId(pid)})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    uid = str(user["_id"])
    likes = p.get("likes", [])
    if uid in likes:
        likes.remove(uid)
        liked = False
    else:
        likes.append(uid)
        liked = True
    await db.posts.update_one({"_id": ObjectId(pid)}, {"$set": {"likes": likes}})
    return {"liked": liked, "like_count": len(likes)}


@api.get("/posts/{pid}/comments")
async def list_comments(pid: str, user: dict = Depends(get_current_user)):
    comments = await db.comments.find({"post_id": pid}).sort("created_at", 1).to_list(500)
    return [{
        "id": str(c["_id"]),
        "author_name": c.get("author_name"),
        "author_initials": c.get("author_initials"),
        "author_id": c.get("author_id"),
        "text": c.get("text"),
        "created_at": c.get("created_at"),
    } for c in comments]


@api.post("/posts/{pid}/comments")
async def add_comment(pid: str, body: CommentBody, user: dict = Depends(get_current_user)):
    if not await db.posts.find_one({"_id": ObjectId(pid)}):
        raise HTTPException(status_code=404, detail="Post not found")
    doc = {
        "post_id": pid,
        "author_id": str(user["_id"]),
        "author_name": user.get("name"),
        "author_initials": user.get("initials"),
        "text": body.text,
        "created_at": now_iso(),
    }
    res = await db.comments.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {
        "id": str(res.inserted_id),
        "author_name": doc["author_name"],
        "author_initials": doc["author_initials"],
        "author_id": doc["author_id"],
        "text": doc["text"],
        "created_at": doc["created_at"],
    }


# ================================================================ TIME OFF
def serialize_timeoff(t: dict) -> dict:
    return {
        "id": str(t["_id"]),
        "user_id": t.get("user_id"),
        "name": t.get("name"),
        "initials": t.get("initials"),
        "date": t.get("date"),
        "reason": t.get("reason"),
        "status": t.get("status"),
        "created_at": t.get("created_at"),
    }


@api.get("/timeoff")
async def timeoff_day(date: str, user: dict = Depends(get_current_user)):
    items = await db.timeoff.find({"date": date}).to_list(500)
    return [serialize_timeoff(t) for t in items]


@api.get("/timeoff/month")
async def timeoff_month(year: int, month: int, user: dict = Depends(get_current_user)):
    prefix = f"{year:04d}-{month:02d}"
    items = await db.timeoff.find({"date": {"$regex": f"^{prefix}"}}).to_list(1000)
    return [serialize_timeoff(t) for t in items]


@api.post("/timeoff")
async def create_timeoff(body: TimeOffBody, user: dict = Depends(get_current_user)):
    perms = compute_permissions(user.get("role", "staff"))
    status = body.status or "pending"
    if status == "approved" and not perms.get("add_approved_timeoff"):
        status = "pending"
    if status not in ("pending", "approved", "declined"):
        status = "pending"
    try:
        req_date = datetime.fromisoformat(str(body.date).strip()).date().isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be in YYYY-MM-DD format")
    duplicate = await db.timeoff.find_one({
        "user_id": str(user["_id"]),
        "date": req_date,
        "status": {"$in": ["pending", "approved"]},
    })
    if duplicate:
        raise HTTPException(status_code=409, detail="There is already a time-off request for that date")
    doc = {
        "user_id": str(user["_id"]),
        "name": user.get("name"),
        "initials": user.get("initials"),
        "date": req_date,
        "reason": body.reason,
        "status": status,
        "created_at": now_iso(),
    }
    res = await db.timeoff.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_timeoff(doc)


@api.put("/timeoff/{tid}/status")
async def set_timeoff_status(tid: str, status: str, user: dict = Depends(require("approve_timeoff"))):
    if status not in ("pending", "approved", "declined"):
        raise HTTPException(status_code=400, detail="Invalid status")
    t = await db.timeoff.find_one({"_id": ObjectId(tid)})
    if not t:
        raise HTTPException(status_code=404, detail="Request not found")
    await db.timeoff.update_one({"_id": ObjectId(tid)}, {"$set": {"status": status}})
    fresh = await db.timeoff.find_one({"_id": ObjectId(tid)})
    return serialize_timeoff(fresh)


@api.delete("/timeoff/{tid}")
async def delete_timeoff(tid: str, user: dict = Depends(get_current_user)):
    t = await db.timeoff.find_one({"_id": ObjectId(tid)})
    if not t:
        raise HTTPException(status_code=404, detail="Request not found")
    perms = compute_permissions(user.get("role", "staff"))
    if t.get("user_id") != str(user["_id"]) and not perms.get("approve_timeoff"):
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.timeoff.delete_one({"_id": ObjectId(tid)})
    return {"ok": True}


@api.get("/daylimit")
async def get_daylimit(date: str, user: dict = Depends(get_current_user)):
    rec = await db.daylimits.find_one({"date": date})
    limit = rec.get("limit") if rec else SYSTEM_DEFAULT_DAY_LIMIT
    approved = await db.timeoff.count_documents({"date": date, "status": "approved"})
    return {"date": date, "limit": limit, "approved": approved, "remaining": max(limit - approved, 0)}


@api.put("/daylimit")
async def set_daylimit(body: DayLimitBody, user: dict = Depends(require("set_daylimit"))):
    await db.daylimits.update_one({"date": body.date}, {"$set": {"limit": body.limit}}, upsert=True)
    approved = await db.timeoff.count_documents({"date": body.date, "status": "approved"})
    return {"date": body.date, "limit": body.limit, "approved": approved, "remaining": max(body.limit - approved, 0)}


# ================================================================ SCHEDULES
def serialize_schedule(s: dict) -> dict:
    return {
        "id": str(s["_id"]),
        "title": s.get("title"),
        "period": s.get("period"),
        "file_id": s.get("file_id"),
        "file_name": s.get("file_name"),
        "content_type": s.get("content_type"),
        "size": s.get("size"),
        "created_at": s.get("created_at"),
    }


@api.get("/schedules")
async def list_schedules(period: str, user: dict = Depends(get_current_user)):
    items = await db.schedules.find({"period": period}).sort("created_at", -1).to_list(500)
    return [serialize_schedule(s) for s in items]


@api.post("/schedules/upload")
async def upload_schedule(
    file: UploadFile = File(...),
    title: str = Form(...),
    period: str = Form(...),
    user: dict = Depends(require("manage_schedules")),
):
    content = await file.read()
    ensure_upload_size(content)
    fdoc = {
        "content": Binary(content),
        "content_type": file.content_type or "application/octet-stream",
        "file_name": file.filename,
        "size": len(content),
        "created_at": now_iso(),
    }
    fres = await db.files.insert_one(fdoc)
    sdoc = {
        "title": title,
        "period": period,
        "file_id": str(fres.inserted_id),
        "file_name": file.filename,
        "content_type": fdoc["content_type"],
        "size": len(content),
        "uploader_id": str(user["_id"]),
        "created_at": now_iso(),
    }
    sres = await db.schedules.insert_one(sdoc)
    sdoc["_id"] = sres.inserted_id
    return serialize_schedule(sdoc)


@api.delete("/schedules/{sid}")
async def delete_schedule(sid: str, user: dict = Depends(require("manage_schedules"))):
    s = await db.schedules.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if s.get("file_id"):
        try:
            await db.files.delete_one({"_id": ObjectId(s["file_id"])})
        except Exception:
            pass
    await db.schedules.delete_one({"_id": ObjectId(sid)})
    return {"ok": True}


# ================================================================ UPLOADS / FILES
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    ensure_upload_size(content)
    fdoc = {
        "content": Binary(content),
        "content_type": file.content_type or "application/octet-stream",
        "file_name": file.filename,
        "size": len(content),
        "created_at": now_iso(),
    }
    res = await db.files.insert_one(fdoc)
    return {"id": str(res.inserted_id)}


@api.get("/files/{fid}")
async def serve_file(fid: str, request: Request):
    # auth via bearer OR ?token=
    token = token_from_request(request)
    decode_token(token)
    try:
        f = await db.files.find_one({"_id": ObjectId(fid)})
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=bytes(f["content"]), media_type=f.get("content_type", "application/octet-stream"))


# ================================================================ CHAT
class ChatHub:
    def __init__(self):
        self.rooms: dict = {}

    async def connect(self, cid: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(cid, set()).add(ws)

    def disconnect(self, cid: str, ws: WebSocket):
        self.rooms.get(cid, set()).discard(ws)

    async def broadcast(self, cid: str, payload: dict, exclude: WebSocket = None):
        for ws in list(self.rooms.get(cid, set())):
            if exclude is not None and ws is exclude:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(cid, ws)


hub = ChatHub()


async def chat_snippet(c: dict) -> dict:
    last = await db.messages.find({"chat_id": str(c["_id"])}).sort("created_at", -1).limit(1).to_list(1)
    last_message, last_sender = None, None
    if last:
        m = last[0]
        last_sender = m.get("sender_name")
        last_message = "\U0001F4F7 Photo" if (m.get("image_id") and not m.get("text")) else m.get("text")
    return {
        "id": str(c["_id"]),
        "name": c.get("name"),
        "description": c.get("description"),
        "is_everyone": c.get("is_everyone", False),
        "member_ids": c.get("member_ids", []),
        "access": c.get("access"),
        "last_message": last_message,
        "last_sender": last_sender,
        "created_at": c.get("created_at"),
    }


def can_access_chat(c: dict, user: dict) -> bool:
    if c.get("is_everyone"):
        return True
    return str(user["_id"]) in c.get("member_ids", [])


@api.get("/chats")
async def list_chats(user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    chats = await db.chats.find({"$or": [{"is_everyone": True}, {"member_ids": uid}]}).to_list(500)
    out = [await chat_snippet(c) for c in chats]
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out


@api.post("/chats")
async def create_chat(body: ChatBody, user: dict = Depends(get_current_user)):
    members = list(set(body.member_ids + [str(user["_id"])])) if not body.is_everyone else []
    doc = {
        "name": body.name,
        "description": body.description,
        "access": body.access,
        "is_everyone": body.is_everyone,
        "member_ids": members,
        "creator_id": str(user["_id"]),
        "created_at": now_iso(),
    }
    res = await db.chats.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await chat_snippet(doc)


@api.get("/chats/{cid}/messages")
async def list_messages(cid: str, user: dict = Depends(get_current_user)):
    c = await db.chats.find_one({"_id": ObjectId(cid)})
    if not c or not can_access_chat(c, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    msgs = await db.messages.find({"chat_id": cid}).sort("created_at", 1).to_list(1000)
    return [{
        "id": str(m["_id"]),
        "sender_id": m.get("sender_id"),
        "sender_name": m.get("sender_name"),
        "sender_initials": m.get("sender_initials"),
        "text": m.get("text"),
        "image_id": m.get("image_id"),
        "read_by": m.get("read_by", []),
        "created_at": m.get("created_at"),
    } for m in msgs]


@api.post("/chats/{cid}/messages")
async def send_message(cid: str, body: MessageBody, user: dict = Depends(get_current_user)):
    c = await db.chats.find_one({"_id": ObjectId(cid)})
    if not c or not can_access_chat(c, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    if not body.text and not body.image_id:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    doc = {
        "chat_id": cid,
        "sender_id": str(user["_id"]),
        "sender_name": user.get("name"),
        "sender_initials": user.get("initials"),
        "text": body.text,
        "image_id": body.image_id,
        "read_by": [str(user["_id"])],
        "created_at": now_iso(),
    }
    res = await db.messages.insert_one(doc)
    out = {
        "id": str(res.inserted_id),
        "sender_id": doc["sender_id"],
        "sender_name": doc["sender_name"],
        "sender_initials": doc["sender_initials"],
        "text": doc["text"],
        "image_id": doc["image_id"],
        "read_by": doc["read_by"],
        "created_at": doc["created_at"],
    }
    await hub.broadcast(cid, {"type": "message", "message": out})
    return out


@api.websocket("/ws/chat/{cid}")
async def ws_chat(websocket: WebSocket, cid: str, token: str = ""):
    try:
        payload = decode_token(token)
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        chat = await db.chats.find_one({"_id": ObjectId(cid)})
        if not user or not chat or not can_access_chat(chat, user):
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
    await hub.connect(cid, websocket)
    sender_id = str(user["_id"])
    sender_name = user.get("name")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("type") == "typing":
                await hub.broadcast(cid, {"type": "typing", "user_id": sender_id, "name": sender_name}, exclude=websocket)
    except WebSocketDisconnect:
        hub.disconnect(cid, websocket)
    except Exception:
        hub.disconnect(cid, websocket)


@api.post("/chats/{cid}/read")
async def mark_read(cid: str, user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    await db.messages.update_many(
        {"chat_id": cid, "sender_id": {"$ne": uid}, "read_by": {"$ne": uid}},
        {"$push": {"read_by": uid}},
    )
    return {"ok": True}


# ================================================================ KNOWLEDGE / KUDOS / ADMIN
@api.get("/knowledge/hospital_rules")
async def hospital_rules(user: dict = Depends(get_current_user)):
    return HOSPITAL_RULES


def badge_for(kudos: int) -> str:
    if kudos >= 10:
        return "Legend"
    if kudos >= 5:
        return "Rising Star"
    if kudos >= 1:
        return "Team Player"
    return "New Teammate"


@api.get("/achievements")
async def achievements(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"name": 1, "initials": 1, "job_title": 1, "kudos": 1}).to_list(1000)
    board = [{
        "id": str(u["_id"]),
        "name": u.get("name"),
        "initials": u.get("initials"),
        "job_title": u.get("job_title"),
        "kudos": u.get("kudos", 0),
        "badge": badge_for(u.get("kudos", 0)),
        "points": u.get("kudos", 0) * 10,
    } for u in users]
    board.sort(key=lambda x: x["kudos"], reverse=True)
    return board


@api.get("/kudos/spotlight")
async def kudos_spotlight(user: dict = Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$to_id", "count": {"$sum": 1}, "last": {"$max": "$created_at"}}},
        {"$sort": {"count": -1, "last": -1}},
        {"$limit": 50},
    ]
    res = await db.kudos.aggregate(pipeline).to_list(50)
    # Walk the leaderboard and feature the top recipient that still exists —
    # a deleted account must never show up here (and names are read live so a
    # rename is reflected immediately).
    for top in res:
        try:
            u = await db.users.find_one({"_id": ObjectId(top["_id"])},
                                        {"name": 1, "initials": 1, "job_title": 1})
        except Exception:
            u = None
        if not u:
            continue
        return {"spotlight": {
            "id": top["_id"], "name": u.get("name"), "initials": u.get("initials"),
            "job_title": u.get("job_title"), "count": top["count"],
        }}
    return {"spotlight": None}


@api.get("/kudos")
async def list_kudos(user: dict = Depends(get_current_user)):
    items = await db.kudos.find().sort("created_at", -1).limit(50).to_list(50)
    return [{
        "id": str(k["_id"]),
        "from_name": k.get("from_name"),
        "from_initials": k.get("from_initials"),
        "to_name": k.get("to_name"),
        "to_initials": k.get("to_initials"),
        "message": k.get("message"),
        "created_at": k.get("created_at"),
    } for k in items]


@api.post("/kudos")
async def give_kudos(body: KudosBody, user: dict = Depends(get_current_user)):
    if body.to_id == str(user["_id"]):
        raise HTTPException(status_code=400, detail="You can't give kudos to yourself")
    target = await db.users.find_one({"_id": ObjectId(body.to_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    doc = {
        "from_id": str(user["_id"]),
        "from_name": user.get("name"),
        "from_initials": user.get("initials"),
        "to_id": body.to_id,
        "to_name": target.get("name"),
        "to_initials": target.get("initials"),
        "message": body.message,
        "created_at": now_iso(),
    }
    res = await db.kudos.insert_one(doc)
    await db.users.update_one({"_id": ObjectId(body.to_id)}, {"$inc": {"kudos": 1}})
    doc["_id"] = res.inserted_id
    return {
        "id": str(res.inserted_id),
        "from_name": doc["from_name"], "from_initials": doc["from_initials"],
        "to_name": doc["to_name"], "to_initials": doc["to_initials"],
        "message": doc["message"], "created_at": doc["created_at"],
    }


@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require("admin_dashboard"))):
    return {
        "total_staff": await db.users.count_documents({}),
        "pending_timeoff": await db.timeoff.count_documents({"status": "pending"}),
        "active_chats": await db.chats.count_documents({}),
        "schedules": await db.schedules.count_documents({}),
        "posts": await db.posts.count_documents({}),
    }


# ================================================================ INVITES
def serialize_invite(i: dict) -> dict:
    return {
        "id": str(i["_id"]),
        "code": i.get("code"),
        "channel": i.get("channel"),
        "value": i.get("value"),
        "campus": i.get("campus"),
        "job_title": i.get("job_title"),
        "access": i.get("access"),
        "used": i.get("used", False),
        "expires_at": i.get("expires_at"),
        "created_at": i.get("created_at"),
    }


@api.get("/invites")
async def list_invites(user: dict = Depends(require("invite"))):
    items = await db.invites.find({"creator_id": str(user["_id"])}).sort("created_at", -1).to_list(500)
    return [serialize_invite(i) for i in items]


@api.post("/invites")
async def create_invite(body: InviteBody, user: dict = Depends(require("invite"))):
    if body.access not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid access role")
    doc = {
        "code": gen_code(6),
        "channel": body.channel,
        "value": body.value,
        "campus": body.campus,
        "job_title": body.job_title,
        "access": body.access,
        "used": False,
        "creator_id": str(user["_id"]),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": now_iso(),
    }
    res = await db.invites.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_invite(doc)


@api.delete("/invites/{iid}")
async def delete_invite(iid: str, user: dict = Depends(require("invite"))):
    i = await db.invites.find_one({"_id": ObjectId(iid)})
    if not i or i.get("creator_id") != str(user["_id"]):
        raise HTTPException(status_code=404, detail="Invite not found")
    await db.invites.delete_one({"_id": ObjectId(iid)})
    return {"ok": True}


# ================================================================ LOCATIONS
@api.get("/locations")
async def list_locations(user: dict = Depends(get_current_user)):
    items = await db.locations.find().to_list(500)
    return [{"id": str(l["_id"]), "name": l.get("name"), "campus_code": l.get("campus_code")} for l in items]


@api.post("/locations")
async def create_location(body: LocationBody, user: dict = Depends(require("manage_locations"))):
    doc = {"name": body.name, "campus_code": body.campus_code, "created_at": now_iso()}
    res = await db.locations.insert_one(doc)
    return {"id": str(res.inserted_id), "name": body.name, "campus_code": body.campus_code}


# ---------------------------------------------------------------- health
# /health is a pure liveness probe (fast, no I/O) — use it for the Coolify
# health check. /health/ready additionally pings MongoDB, so a wrong MONGO_URL
# or a stopped database is visible instead of silently serving 500s.
async def _health_payload():
    return {"status": "ok", "service": "delquro-connect"}


@api.get("/health")
async def api_health():
    return await _health_payload()


@api.get("/health/ready")
async def api_health_ready():
    try:
        await db.command("ping")
    except Exception as e:
        logger.error("readiness check failed — MongoDB unreachable: %s", e)
        raise HTTPException(
            status_code=503,
            detail={"status": "degraded", "database": "unreachable", "error": str(e)[:200]},
        )
    return {"status": "ok", "database": "ok", "service": "delquro-connect"}


@app.get("/health")
async def health():
    return await _health_payload()


@app.get("/health/ready")
async def health_ready():
    return await api_health_ready()


# ---------------------------------------------------------------- bootstrap
# Middleware is registered before the router is included (idiomatic Starlette
# ordering) so every /api route — including future ones — goes through CORS.
#
# Note: browsers reject `Access-Control-Allow-Origin: *` together with
# credentials, so credentials are only enabled for explicit origin lists. This
# app authenticates with Bearer tokens (not cookies), so nothing is lost.
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(NormalizePathMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api)


# ---------------------------------------------------------------- frontend (SPA)
# When a production frontend build is available (the all-in-one Docker image, or
# a local `npm run build`), serve it from the same origin as the API. The SPA
# then calls the relative "/api" path, so no CORS setup and no build-time
# backend URL are needed — see docs/DEPLOYMENT.md.
FRONTEND_BUILD_DIR = Path(
    os.environ.get("FRONTEND_BUILD_DIR", ROOT_DIR.parent / "frontend" / "build")
)


class ImmutableStaticFiles(StaticFiles):
    """CRA asset filenames are content-hashed, so they can be cached forever."""

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        return response


if FRONTEND_BUILD_DIR.is_dir():
    logger.info("serving frontend build from %s", FRONTEND_BUILD_DIR)
    _assets_dir = FRONTEND_BUILD_DIR / "static"
    if _assets_dir.is_dir():
        app.mount("/static", ImmutableStaticFiles(directory=str(_assets_dir)), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        # Unknown API routes must stay JSON 404s rather than returning the SPA
        # shell, otherwise client bugs turn into confusing HTML responses.
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        root = FRONTEND_BUILD_DIR.resolve()
        if full_path:
            candidate = (root / full_path).resolve()
            # `is_relative_to` guards against path traversal (e.g. /../../etc/passwd).
            if candidate.is_relative_to(root) and candidate.is_file():
                return FileResponse(candidate)
        index = root / "index.html"
        if index.is_file():
            # index.html references hashed assets, so it must never be cached.
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        raise HTTPException(status_code=404, detail="Frontend build not found")
else:
    logger.info("no frontend build at %s — API-only mode", FRONTEND_BUILD_DIR)


@app.on_event("startup")
async def startup():
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 32:
        # PyJWT already warns; this makes the cause obvious in deployment logs.
        logger.warning(
            "JWT_SECRET is shorter than 32 characters — use a longer random value in production."
        )
    try:
        await db.users.create_index("email", unique=True)
        await db.login_attempts.create_index("identifier")
        # Expire stale lockout counters automatically (1 day after the last
        # failed attempt) instead of keeping them forever.
        await db.login_attempts.create_index("updated_at", expireAfterSeconds=86400)
    except Exception as e:
        logger.warning(f"index setup: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
