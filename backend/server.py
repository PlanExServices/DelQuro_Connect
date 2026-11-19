import os
import json
import logging
import re
import secrets
import string
import calendar
from urllib.parse import urlsplit
from pathlib import Path
from datetime import datetime, timezone, timedelta, date as date_cls
from typing import List, Literal, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from bson.binary import Binary
from pydantic import BaseModel, EmailStr, Field, field_validator
from pymongo.errors import DuplicateKeyError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (
    hash_password, verify_password, create_access_token,
    decode_token, token_from_request,
)
from account_deletion import purge_account_data
from content_policy import (
    TERMS_VERSION, REPORT_TARGETS, VISIBLE, ContentReport, ReviewReport, filter_text, visible_from,
)
from mobile_sessions import refresh_digest, rotate_session, session_is_active, start_session

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
jwt_secret = require_env("JWT_SECRET")  # auth.get_jwt_secret() reads the same variable
if jwt_secret == "change-me-to-a-long-random-string":
    raise RuntimeError("Replace the example JWT_SECRET with a unique random value before starting the server")

app = FastAPI(title="DelQuro Connect API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("delquro")

# MongoDB documents are capped at 16 MB, so reject oversized uploads up front
# with a clear 413 instead of letting the insert blow up with a 500.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
CHAT_SOCKET_PROTOCOL = "connect-chat"

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


@app.middleware("http")
async def protect_web_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "private, no-store")
    return response


@app.exception_handler(RequestValidationError)
async def redact_validation_inputs(request: Request, exc: RequestValidationError):
    errors = [{"type": error["type"], "loc": error["loc"], "msg": error["msg"]} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


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
        "community_terms_accepted": u.get("community_terms_version") == TERMS_VERSION,
        "account_deletion_pending": u.get("account_deletion_pending", False),
    }


# ---------------------------------------------------------------- auth deps
async def authenticated_user(payload: dict, *, allow_mobile: bool) -> dict:
    if not ObjectId.is_valid(payload.get("sub")):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user or user.get("suspended"):
        raise HTTPException(status_code=401, detail="Account unavailable")
    # The existing mobile session version now also invalidates browser tokens.
    if payload.get("ver", 0) != user.get("mobile_session_version", 0):
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")
    if "sid" in payload and (
        not allow_mobile or not await session_is_active(db, payload["sid"], user)
    ):
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")
    return user


async def get_current_user(request: Request) -> dict:
    token = token_from_request(request)
    payload = decode_token(token)
    user = await authenticated_user(payload, allow_mobile=True)
    request.state.mobile_session = "sid" in payload
    deleting = request.method == "DELETE" and request.url.path == "/api/me"
    checking_account = request.method == "GET" and request.url.path == "/api/auth/me"
    if user.get("account_deletion_pending") and not (deleting or checking_account):
        raise HTTPException(403, "Account deletion is pending. Reopen Delete account to finish.")
    return user


def require_community_terms(user: dict) -> None:
    if user.get("community_terms_version") != TERMS_VERSION:
        raise HTTPException(403, "Accept the Community Guidelines before posting.")


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
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return v


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class MobileRegistration(RegisterBody):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=32)
    community_terms_accepted: Literal[True]


class RefreshBody(BaseModel):
    refresh_token: str = Field(min_length=43, max_length=43)


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
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return v


class DeleteMeBody(BaseModel):
    current_password: str


class PostBody(BaseModel):
    content: str
    title: Optional[str] = None
    image_id: Optional[str] = None
    is_protocol: bool = False
    protocol_version: Optional[str] = None


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
    location_id: Optional[str] = None
    job_title: Optional[str] = None
    access: str = "staff"


class LocationBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    campus_code: str = Field(min_length=2, max_length=16)
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: str = "#1B2A4A"
    accent_color: str = "#00A5A8"
    soft_color: str = "#E8F1F5"

    @field_validator("name")
    @classmethod
    def clean_location_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Location name is required")
        return value

    @field_validator("campus_code")
    @classmethod
    def clean_campus_code(cls, value):
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{2,16}", value):
            raise ValueError("Campus code must be 2–16 letters or numbers")
        return value

    @field_validator("website_url", "logo_url")
    @classmethod
    def clean_brand_url(cls, value, info):
        if value is None or not value.strip():
            return None
        value = value.strip()
        if info.field_name == "logo_url" and re.fullmatch(r"/brands/[A-Za-z0-9_.-]+", value):
            return value
        parts = urlsplit(value)
        if len(value) > 2048 or parts.scheme != "https" or not parts.hostname or parts.username or parts.password or any(char.isspace() for char in value):
            raise ValueError("Use an HTTPS URL for the website or logo")
        return value

    @field_validator("primary_color", "accent_color", "soft_color")
    @classmethod
    def clean_brand_color(cls, value):
        value = value.strip().upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", value):
            raise ValueError("Brand colors must be six-digit hex values")
        return value


# ================================================================ AUTH ROUTES
@api.get("/auth/status")
async def auth_status():
    admin = await db.users.find_one({"role": "admin"})
    return {"needs_setup": admin is None}


async def check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({
        "identifier": identifier, "count": {"$gte": LOCKOUT_ATTEMPTS}, "locked_until": {"$gt": now_iso()},
    }, {"_id": 1})
    if rec:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes.",
        )


async def register_fail(identifier: str):
    """Count failures atomically across web and mobile sign-in requests."""
    now = datetime.now(timezone.utc)
    key = {"_id": identifier}
    changes = [{"$set": {
        "identifier": {"$literal": identifier},
        "count": {"$cond": [
            {"$gt": [{"$ifNull": ["$locked_until", ""]}, now.isoformat()]},
            {"$add": [{"$ifNull": ["$count", 0]}, 1]},
            1,
        ]},
        "locked_until": (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat(),
        "updated_at": now,
    }}]
    try:
        await db.login_attempts.update_one(key, changes, upsert=True)
    except DuplicateKeyError:
        await db.login_attempts.update_one(key, changes)


async def create_account(body: RegisterBody, *, mobile: bool = False):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    any_admin = await db.users.find_one({"role": "admin"})
    role = "staff"
    campus = body.campus
    job_title = body.job_title
    location_id = None
    invite = None
    user_id = ObjectId()

    if body.bootstrap_code and not mobile:
        if any_admin is not None:
            raise HTTPException(status_code=400, detail="Workspace is already set up. Please sign in.")
        configured_code = os.environ.get("ADMIN_BOOTSTRAP_CODE", "")
        if configured_code == "DELQURO-SETUP-2026":
            raise HTTPException(status_code=503, detail="Replace the example setup code before creating an admin")
        if not configured_code or not secrets.compare_digest(body.bootstrap_code, configured_code):
            raise HTTPException(status_code=400, detail="Invalid setup code")
        role = "admin"
    elif body.code and body.code.strip():
        invite = await db.invites.find_one({"code": body.code.strip().upper()})
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        if invite.get("expires_at") and datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="This invite code has expired")
        if invite.get("used"):
            raise HTTPException(status_code=400, detail="This invite code has already been used")
        if invite.get("channel") == "email" and invite.get("value"):
            if email != invite["value"].strip().lower():
                raise HTTPException(400, "This invitation is for a different email address")
        claimed = await db.invites.update_one(
            {"_id": invite["_id"], "used": False},
            {"$set": {"used": True, "used_at": now_iso(), "registered_user_id": str(user_id)}},
        )
        if claimed.matched_count != 1:
            raise HTTPException(status_code=400, detail="This invite code has already been used")
        role = invite.get("access", "staff")
        campus = invite.get("campus") or campus
        job_title = invite.get("job_title") or job_title
        location_id = invite.get("location_id")
    else:
        raise HTTPException(status_code=400, detail="An invitation code is required")

    doc = {
        "_id": user_id,
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
    if mobile:
        doc.update(community_terms_version=TERMS_VERSION, community_terms_accepted_at=now_iso())
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        if invite:
            await db.invites.update_one(
                {"_id": invite["_id"], "registered_user_id": str(user_id)},
                {"$set": {"used": False}, "$unset": {"used_at": "", "registered_user_id": ""}},
            )
        raise HTTPException(400, "An account with this email already exists")
    return doc


@api.post("/auth/register")
async def register(body: RegisterBody):
    doc = await create_account(body)
    token = create_access_token(str(doc["_id"]), doc["email"])
    return {"access_token": token, "user": public_user(doc)}


async def authenticate(body: LoginBody, *, allow_suspended: bool = False):
    email = body.email.lower()
    identifier = email
    await check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await register_fail(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_many({"identifier": identifier})
    if user.get("suspended") and not allow_suspended:
        raise HTTPException(403, "Account suspended. Contact your workspace administrator.")
    return user


@api.post("/auth/login")
async def login(body: LoginBody):
    user = await authenticate(body)
    token = create_access_token(str(user["_id"]), user["email"], version=user.get("mobile_session_version", 0))
    return {"access_token": token, "user": public_user(user)}


@api.post("/mobile/auth/register")
async def mobile_register(body: MobileRegistration):
    user = await create_account(body, mobile=True)
    return {**await start_session(db, user), "user": public_user(user)}


@api.post("/mobile/auth/login")
async def mobile_login(body: LoginBody):
    user = await authenticate(body)
    return {**await start_session(db, user), "user": public_user(user)}


@api.post("/mobile/auth/refresh")
async def mobile_refresh(body: RefreshBody):
    session, user = await rotate_session(db, body.refresh_token)
    return {**session, "user": public_user(user)}


@api.post("/mobile/auth/logout")
async def mobile_logout(body: RefreshBody):
    await db.mobile_sessions.delete_one({"refresh_digest": refresh_digest(body.refresh_token)})
    return {"ok": True}


@api.post("/mobile/community/accept")
async def accept_community_terms(user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {
        "community_terms_version": TERMS_VERSION, "community_terms_accepted_at": now_iso(),
    }})
    return {"ok": True}


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
async def change_password(body: PasswordBody, request: Request, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    version = user.get("mobile_session_version", 0) + 1
    result = await db.users.update_one({
        "_id": user["_id"],
        "password_hash": user["password_hash"],
        "suspended": {"$ne": True},
        "account_deletion_pending": {"$ne": True},
    }, {
        "$set": {"password_hash": hash_password(body.new_password)},
        "$inc": {"mobile_session_version": 1},
    })
    if not result.matched_count:
        raise HTTPException(409, "Your account changed. Sign in again to update your password.")
    await db.mobile_sessions.delete_many({"user_id": user["_id"], "user_version": {"$lt": version}})
    response = {"ok": True}
    if not request.state.mobile_session:
        response["access_token"] = create_access_token(str(user["_id"]), user["email"], version=version)
    return response


@api.delete("/me")
async def delete_me(body: DeleteMeBody, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    return await delete_or_request_account(user)


@api.post("/account-deletion")
async def delete_account_from_web(body: LoginBody):
    # Password confirmation uses the existing login lockout. This flow issues
    # no session and also works for a suspended account.
    user = await authenticate(body, allow_suspended=True)
    return await delete_or_request_account(user)


async def delete_or_request_account(user):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"account_deletion_pending": True}})
    if user.get("role") == "admin":
        other_admin = await db.users.find_one({
            "role": "admin", "_id": {"$ne": user["_id"]},
            "suspended": {"$ne": True}, "account_deletion_pending": {"$ne": True},
        })
        if not other_admin:
            await db.users.update_one({"_id": user["_id"]}, {
                "$set": {"account_deletion_requested_at": user.get("account_deletion_requested_at") or now_iso()},
                "$unset": {"account_deletion_pending": ""},
            })
            return {"ok": True, "status": "requested"}

    await purge_account_data(db, user)
    return {"ok": True, "status": "deleted"}


# ================================================================ TEAM / META
@api.get("/team/members")
async def team_members(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"email": 1, "name": 1, "initials": 1, "campus": 1, "role": 1, "job_title": 1, "birthday": 1, "start_date": 1, "location_id": 1, "kudos": 1, "preferences": 1}).to_list(1000)
    directory = []
    for person in users:
        member = public_user(person)
        if person["_id"] != user["_id"]:
            preferences = member["preferences"] or {}
            if not preferences.get("show_birthday", True):
                member["birthday"] = None
            if not preferences.get("show_anniversary", True):
                member["start_date"] = None
        directory.append(member)
    return directory


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
    acknowledgments = p.get("acknowledged_by", [])
    comment_count = await db.comments.count_documents({"post_id": str(p["_id"]), **VISIBLE})
    return {
        "id": str(p["_id"]),
        "author_name": p.get("author_name"),
        "author_initials": p.get("author_initials"),
        "author_id": p.get("author_id"),
        "title": p.get("title"),
        "content": p.get("content"),
        "image_id": p.get("image_id"),
        "is_protocol": p.get("is_protocol", False),
        "protocol_version": p.get("protocol_version"),
        "acknowledged": user_id in acknowledgments,
        "acknowledgment_count": len(acknowledgments),
        "like_count": len(likes),
        "liked": user_id in likes,
        "comment_count": comment_count,
        "created_at": p.get("created_at"),
    }


@api.get("/posts")
async def list_posts(user: dict = Depends(get_current_user)):
    posts = await db.posts.find(visible_from("author_id", user)).sort("created_at", -1).to_list(500)
    return [await serialize_post(p, str(user["_id"])) for p in posts]


@api.post("/posts")
async def create_post(body: PostBody, user: dict = Depends(require("post_huddle"))):
    require_community_terms(user)
    filter_text(body.title, body.content)
    await require_attachment_owner(body.image_id, user)
    if body.is_protocol and (not (body.title or "").strip() or not (body.protocol_version or "").strip()):
        raise HTTPException(status_code=400, detail="A protocol needs a title and version")
    doc = {
        "author_id": str(user["_id"]),
        "author_name": user.get("name"),
        "author_initials": user.get("initials"),
        "title": body.title,
        "content": body.content,
        "image_id": body.image_id,
        "is_protocol": body.is_protocol,
        "protocol_version": body.protocol_version.strip() if body.is_protocol else None,
        "acknowledged_by": [],
        "likes": [],
        "created_at": now_iso(),
    }
    res = await db.posts.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await serialize_post(doc, str(user["_id"]))


@api.post("/posts/{pid}/acknowledge")
async def acknowledge_protocol(pid: str, user: dict = Depends(get_current_user)):
    p = await db.posts.find_one({"_id": ObjectId(pid), **visible_from("author_id", user)}) if ObjectId.is_valid(pid) else None
    if not p or not p.get("is_protocol"):
        raise HTTPException(status_code=404, detail="Protocol not found")
    await db.posts.update_one({"_id": ObjectId(pid)}, {"$addToSet": {"acknowledged_by": str(user["_id"])}})
    fresh = await db.posts.find_one({"_id": ObjectId(pid)})
    return await serialize_post(fresh, str(user["_id"]))


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
    if not ObjectId.is_valid(pid) or not await db.posts.find_one({"_id": ObjectId(pid), **visible_from("author_id", user)}):
        raise HTTPException(404, "Post not found")
    comments = await db.comments.find({"post_id": pid, **visible_from("author_id", user)}).sort("created_at", 1).to_list(500)
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
    require_community_terms(user)
    filter_text(body.text)
    if not ObjectId.is_valid(pid) or not await db.posts.find_one({"_id": ObjectId(pid), **visible_from("author_id", user)}):
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
def serialize_timeoff(t: dict, *, include_reason: bool = True) -> dict:
    return {
        "id": str(t["_id"]),
        "user_id": t.get("user_id"),
        "name": t.get("name"),
        "initials": t.get("initials"),
        "date": t.get("date"),
        "reason": t.get("reason") if include_reason else None,
        "status": t.get("status"),
        "created_at": t.get("created_at"),
    }


@api.get("/timeoff")
async def timeoff_day(date: str, request: Request, user: dict = Depends(get_current_user)):
    query = {"date": date}
    if request.state.mobile_session:
        query["user_id"] = str(user["_id"])
    items = await db.timeoff.find(query).to_list(500)
    approver = compute_permissions(user.get("role", "staff"))["approve_timeoff"]
    return [serialize_timeoff(t, include_reason=approver or t.get("user_id") == str(user["_id"])) for t in items]


@api.get("/timeoff/month")
async def timeoff_month(year: int, month: int, request: Request, user: dict = Depends(get_current_user)):
    prefix = f"{year:04d}-{month:02d}"
    query = {"date": {"$regex": f"^{prefix}"}}
    if request.state.mobile_session:
        query["user_id"] = str(user["_id"])
    items = await db.timeoff.find(query).to_list(1000)
    approver = compute_permissions(user.get("role", "staff"))["approve_timeoff"]
    return [serialize_timeoff(t, include_reason=approver or t.get("user_id") == str(user["_id"])) for t in items]


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


@api.get("/daylimit/month")
async def get_month_capacity(year: int, month: int, user: dict = Depends(get_current_user)):
    if not 1 <= month <= 12 or not 1 <= year <= 9999:
        raise HTTPException(status_code=400, detail="Invalid month")
    prefix = f"{year:04d}-{month:02d}"
    overrides = await db.daylimits.find({"date": {"$regex": f"^{prefix}"}}).to_list(31)
    requests = await db.timeoff.find({"date": {"$regex": f"^{prefix}"}}).to_list(1000)
    limits = {item["date"]: item["limit"] for item in overrides}
    counts = {}
    for item in requests:
        day = counts.setdefault(item["date"], {"approved": 0, "pending": 0})
        if item.get("status") in day:
            day[item["status"]] += 1
    days = []
    for day_number in range(1, calendar.monthrange(year, month)[1] + 1):
        day = f"{prefix}-{day_number:02d}"
        limit = limits.get(day, SYSTEM_DEFAULT_DAY_LIMIT)
        approved = counts.get(day, {}).get("approved", 0)
        days.append({"date": day, "limit": limit, "approved": approved,
                     "pending": counts.get(day, {}).get("pending", 0),
                     "remaining": max(limit - approved, 0)})
    return {"default_limit": SYSTEM_DEFAULT_DAY_LIMIT, "days": days}


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
        "effective_start": s.get("effective_start"),
        "effective_end": s.get("effective_end"),
        "campus": s.get("campus"),
        "department": s.get("department"),
        "created_at": s.get("created_at"),
    }


@api.get("/schedules")
async def list_schedules(period: str, user: dict = Depends(get_current_user)):
    if period not in ("current", "upcoming", "previous", "all"):
        raise HTTPException(status_code=400, detail="Invalid schedule period")
    items = await db.schedules.find(visible_from("uploader_id", user)).sort("created_at", -1).to_list(500)
    if period != "all":
        today = datetime.now(timezone.utc).date().isoformat()
        def active_period(schedule):
            start, end = schedule.get("effective_start"), schedule.get("effective_end")
            if start and end:
                if today < start:
                    return "upcoming"
                if today > end:
                    return "previous"
                return "current"
            return schedule.get("period")
        items = [item for item in items if active_period(item) == period]
    return [serialize_schedule(s) for s in items]


@api.post("/schedules/upload")
async def upload_schedule(
    file: UploadFile = File(...),
    title: str = Form(...),
    period: str = Form(...),
    effective_start: Optional[str] = Form(None),
    effective_end: Optional[str] = Form(None),
    campus: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    user: dict = Depends(require("manage_schedules")),
):
    require_community_terms(user)
    filter_text(title)
    if period not in ("current", "upcoming", "previous"):
        raise HTTPException(status_code=400, detail="Invalid schedule period")
    if bool(effective_start) != bool(effective_end):
        raise HTTPException(status_code=400, detail="Provide both effective dates")
    if effective_start:
        try:
            effective_start = date_cls.fromisoformat(effective_start).isoformat()
            effective_end = date_cls.fromisoformat(effective_end).isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Effective dates must use YYYY-MM-DD")
        if effective_end < effective_start:
            raise HTTPException(status_code=400, detail="End date must be on or after start date")
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
        "effective_start": effective_start,
        "effective_end": effective_end,
        "campus": (campus or "").strip() or None,
        "department": (department or "").strip() or None,
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
    require_community_terms(user)
    content = await file.read()
    ensure_upload_size(content)
    fdoc = {
        "content": Binary(content),
        "content_type": file.content_type or "application/octet-stream",
        "file_name": file.filename,
        "size": len(content),
        "owner_id": str(user["_id"]),
        "created_at": now_iso(),
    }
    res = await db.files.insert_one(fdoc)
    return {"id": str(res.inserted_id)}


async def require_attachment_owner(fid, user):
    if not fid:
        return
    if not ObjectId.is_valid(fid) or not await db.files.find_one(
        {"_id": ObjectId(fid), "owner_id": str(user["_id"])}, {"_id": 1},
    ):
        raise HTTPException(404, "Attachment not found")


@api.get("/files/{fid}")
async def serve_file(fid: str, request: Request):
    user = await get_current_user(request)
    if not ObjectId.is_valid(fid):
        raise HTTPException(status_code=404, detail="File not found")
    f = await db.files.find_one({"_id": ObjectId(fid)})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if not await can_view_attachment(fid, user):
        own_staged_file = f.get("owner_id") == str(user["_id"]) and not await linked_attachment(fid)
        if not own_staged_file:
            raise HTTPException(status_code=404, detail="File not found")
    return file_response(f)


def file_response(f):
    media_type = f.get("content_type", "")
    headers = {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Referrer-Policy": "no-referrer",
    }
    if media_type not in ("image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"):
        media_type = "application/octet-stream"
        headers["Content-Disposition"] = "attachment"
    return Response(content=bytes(f["content"]), media_type=media_type, headers=headers)


# ================================================================ CHAT
class ChatHub:
    def __init__(self):
        self.rooms: dict = {}

    async def connect(self, cid: str, ws: WebSocket, user_id: ObjectId, payload: dict):
        await ws.accept(subprotocol=CHAT_SOCKET_PROTOCOL)
        self.rooms.setdefault(cid, {})[ws] = (user_id, payload.get("ver", 0), int(payload["exp"]))

    def disconnect(self, cid: str, ws: WebSocket):
        room = self.rooms.get(cid)
        if room is not None:
            room.pop(ws, None)
            if not room:
                self.rooms.pop(cid, None)

    async def broadcast(self, cid: str, payload: dict, exclude: WebSocket = None):
        room = dict(self.rooms.get(cid, {}))
        if not room:
            return
        chat = await db.chats.find_one({"_id": ObjectId(cid)})
        people = await db.users.find({
            "_id": {"$in": list({membership[0] for membership in room.values()})},
            "suspended": {"$ne": True},
            "account_deletion_pending": {"$ne": True},
        }, {"blocked_user_ids": 1, "mobile_session_version": 1}).to_list(None)
        current = {person["_id"]: person for person in people}
        author_id = payload.get("user_id") or payload.get("message", {}).get("sender_id")
        now = datetime.now(timezone.utc).timestamp()
        for ws, (user_id, version, expires_at) in room.items():
            if exclude is not None and ws is exclude:
                continue
            try:
                user = current.get(user_id)
                if (not user or not chat or not can_access_chat(chat, user)
                    or version != user.get("mobile_session_version", 0) or expires_at <= now):
                    await ws.close(code=1008)
                    self.disconnect(cid, ws)
                elif author_id not in user.get("blocked_user_ids", []):
                    await ws.send_json(payload)
            except Exception:
                self.disconnect(cid, ws)


hub = ChatHub()


async def chat_snippet(c: dict, user: dict) -> dict:
    uid = str(user["_id"])
    filters = {"chat_id": str(c["_id"]), **visible_from("sender_id", user)}
    last = await db.messages.find(filters).sort("created_at", -1).limit(1).to_list(1)
    last_message, last_sender = None, None
    if last:
        m = last[0]
        last_sender = m.get("sender_name")
        last_message = "\U0001F4F7 Photo" if (m.get("image_id") and not m.get("text")) else m.get("text")
    unread_count = await db.messages.count_documents({
        **filters, "sender_id": {**filters["sender_id"], "$ne": uid}, "read_by": {"$ne": uid},
    })
    return {
        "id": str(c["_id"]),
        "name": c.get("name"),
        "description": c.get("description"),
        "is_everyone": c.get("is_everyone", False),
        "member_ids": c.get("member_ids", []),
        "access": c.get("access"),
        "last_message": last_message,
        "last_sender": last_sender,
        "unread_count": unread_count,
        "created_at": c.get("created_at"),
    }


def can_access_chat(c: dict, user: dict) -> bool:
    if c.get("moderation_hidden"):
        return False
    if c.get("is_everyone"):
        return True
    return str(user["_id"]) in c.get("member_ids", [])


async def linked_attachment(fid):
    return (
        await db.schedules.find_one({"file_id": fid}, {"_id": 1}) is not None or
        await db.posts.find_one({"image_id": fid}, {"_id": 1}) is not None or
        await db.messages.find_one({"image_id": fid}, {"_id": 1}) is not None
    )


async def can_view_attachment(fid, user):
    if await db.schedules.find_one({"file_id": fid, **visible_from("uploader_id", user)}, {"_id": 1}):
        return True
    if await db.posts.find_one({"image_id": fid, **visible_from("author_id", user)}, {"_id": 1}):
        return True
    async for message in db.messages.find(
        {"image_id": fid, **visible_from("sender_id", user)}, {"chat_id": 1},
    ):
        cid = message.get("chat_id")
        if ObjectId.is_valid(cid):
            chat = await db.chats.find_one({"_id": ObjectId(cid)})
            if chat and can_access_chat(chat, user):
                return True
    return False


@api.get("/chats")
async def list_chats(user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    chats = await db.chats.find({
        **VISIBLE, "$or": [{"is_everyone": True}, {"member_ids": uid}],
    }).to_list(500)
    out = [await chat_snippet(c, user) for c in chats]
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out


@api.post("/chats")
async def create_chat(body: ChatBody, user: dict = Depends(get_current_user)):
    require_community_terms(user)
    filter_text(body.name, body.description)
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
    return await chat_snippet(doc, user)


@api.get("/chats/{cid}/messages")
async def list_messages(cid: str, request: Request, user: dict = Depends(get_current_user)):
    c = await db.chats.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
    if not c or not can_access_chat(c, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    query = {"chat_id": cid, **visible_from("sender_id", user)}
    if request.state.mobile_session:
        msgs = await db.messages.find(query).sort([("created_at", -1), ("_id", -1)]).limit(100).to_list(100)
        msgs.reverse()
    else:
        msgs = await db.messages.find(query).sort("created_at", 1).to_list(1000)
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
    require_community_terms(user)
    filter_text(body.text)
    c = await db.chats.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
    if not c or not can_access_chat(c, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    if not body.text and not body.image_id:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    await require_attachment_owner(body.image_id, user)
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
async def ws_chat(websocket: WebSocket, cid: str):
    protocols = websocket.scope.get("subprotocols", [])
    credentials = [protocol[5:] for protocol in protocols if protocol.startswith("auth.")]
    if CHAT_SOCKET_PROTOCOL not in protocols or len(credentials) != 1:
        await websocket.close(code=1008)
        return
    token = credentials[0]
    try:
        payload = decode_token(token)
        user = await authenticated_user(payload, allow_mobile=False)
        chat = await db.chats.find_one({"_id": ObjectId(cid)})
        if user.get("account_deletion_pending") or not chat or not can_access_chat(chat, user):
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
    await hub.connect(cid, websocket, user["_id"], payload)
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
                current = await authenticated_user(decode_token(token), allow_mobile=False)
                current_chat = await db.chats.find_one({"_id": ObjectId(cid)})
                if current.get("account_deletion_pending") or not current_chat or not can_access_chat(current_chat, current):
                    await websocket.close(code=1008)
                    break
                await hub.broadcast(cid, {"type": "typing", "user_id": sender_id, "name": sender_name}, exclude=websocket)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close(code=1008)
    finally:
        hub.disconnect(cid, websocket)


@api.post("/chats/{cid}/read")
async def mark_read(cid: str, user: dict = Depends(get_current_user)):
    chat = await db.chats.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
    if not chat or not can_access_chat(chat, user):
        raise HTTPException(403, "Not allowed")
    uid = str(user["_id"])
    visible = visible_from("sender_id", user)
    await db.messages.update_many(
        {"chat_id": cid, **visible, "sender_id": {**visible["sender_id"], "$ne": uid}, "read_by": {"$ne": uid}},
        {"$addToSet": {"read_by": uid}},
    )
    return {"ok": True}


# ================================================================ CONTENT SAFETY
@api.get("/me/blocked-members")
async def blocked_members(user: dict = Depends(get_current_user)):
    ids = [ObjectId(uid) for uid in user.get("blocked_user_ids", []) if ObjectId.is_valid(uid)]
    members = await db.users.find({"_id": {"$in": ids}}, {"name": 1}).to_list(None)
    return [{"id": str(member["_id"]), "name": member.get("name")} for member in members]


@api.put("/me/blocked-members/{uid}")
async def block_member(uid: str, user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(uid) or not await db.users.find_one({"_id": ObjectId(uid)}, {"_id": 1}):
        raise HTTPException(404, "Team member not found")
    if uid == str(user["_id"]):
        raise HTTPException(400, "You cannot block your own account")
    await db.users.update_one({"_id": user["_id"]}, {"$addToSet": {"blocked_user_ids": uid}})
    return {"ok": True}


@api.delete("/me/blocked-members/{uid}")
async def unblock_member(uid: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$pull": {"blocked_user_ids": uid}})
    return {"ok": True}


async def report_target(kind, target_id, user):
    collection, owner_field, _ = REPORT_TARGETS[kind]
    query = {"_id": ObjectId(target_id), **(visible_from(owner_field, user) if owner_field else {})}
    target = await db[collection].find_one(query, {"content": 0, "text": 0})
    if target is None:
        return None
    if kind == "message":
        chat = await db.chats.find_one({"_id": ObjectId(target["chat_id"])})
        if not chat or not can_access_chat(chat, user):
            return None
    elif kind == "chat" and not can_access_chat(target, user):
        return None
    elif kind == "comment":
        post = await db.posts.find_one({"_id": ObjectId(target["post_id"]), **visible_from("author_id", user)})
        if not post:
            return None
    return target


def report_attachment_id(kind, target):
    if not target:
        return None
    return target.get("file_id") if kind == "schedule" else target.get("image_id")


@api.post("/reports", status_code=201)
async def submit_report(body: ContentReport, user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(body.target_id):
        raise HTTPException(404, "Report target not found")
    target = await report_target(body.kind, body.target_id, user)
    if target is None:
        raise HTTPException(404, "Report target not found")
    target_id = str(target["_id"])
    reporter_id = str(user["_id"])
    _, owner_field, _ = REPORT_TARGETS[body.kind]
    subject_user_id = target.get(owner_field) if owner_field else target_id
    # One report per reporter and target, including network retries.
    report_key = f"{reporter_id}:{body.kind}:{target_id}"
    try:
        await db.content_reports.update_one({"_id": report_key}, {"$setOnInsert": {
            "reporter_id": reporter_id, "kind": body.kind, "target_id": target_id, "reason": body.reason,
            "subject_user_id": subject_user_id, "status": "pending", "created_at": now_iso(),
        }}, upsert=True)
    except DuplicateKeyError:
        pass
    return {"ok": True}


@api.get("/moderation/reports")
async def moderation_reports(user: dict = Depends(require("manage_roles"))):
    reports = await db.content_reports.find({"status": "pending"}).sort("created_at", 1).to_list(100)
    results = []
    for report in reports:
        collection, _, fields = REPORT_TARGETS[report["kind"]]
        target = await db[collection].find_one(
            {"_id": ObjectId(report["target_id"])}, {field: 1 for field in (*fields, "file_id", "image_id")},
        )
        summary = " · ".join(str(target[field]) for field in fields if target and target.get(field))
        subject_id = report.get("subject_user_id")
        subject = None
        if ObjectId.is_valid(subject_id):
            subject = await db.users.find_one({"_id": ObjectId(subject_id)}, {"name": 1, "role": 1, "suspended": 1})
        results.append({
            "id": report["_id"], "kind": report["kind"], "reason": report["reason"],
            "created_at": report["created_at"], "summary": summary[:800],
            "subject_name": subject.get("name") if subject else None,
            "can_suspend": bool(subject and subject.get("role") != "admin" and not subject.get("suspended")),
            "can_remove": target is not None and report["kind"] != "member",
            "attachment_available": ObjectId.is_valid(report_attachment_id(report["kind"], target)),
        })
    return results


@api.get("/moderation/reports/{report_id}/attachment")
async def moderation_attachment(report_id: str, user: dict = Depends(require("manage_roles"))):
    report = await db.content_reports.find_one({"_id": report_id, "status": "pending"})
    if report:
        collection, _, _ = REPORT_TARGETS[report["kind"]]
        target = await db[collection].find_one({"_id": ObjectId(report["target_id"])}, {"file_id": 1, "image_id": 1})
        attachment_id = report_attachment_id(report["kind"], target)
        if ObjectId.is_valid(attachment_id):
            file = await db.files.find_one({"_id": ObjectId(attachment_id)})
            if file:
                return file_response(file)
    raise HTTPException(404, "Attachment not found")


@api.post("/moderation/reports/{report_id}")
async def resolve_report(report_id: str, body: ReviewReport, user: dict = Depends(require("manage_roles"))):
    report = await db.content_reports.find_one({"_id": report_id})
    if not report:
        raise HTTPException(404, "Report not found")
    if report["status"] != "pending":
        return {"ok": True}
    if body.action == "remove":
        if report["kind"] == "member":
            raise HTTPException(400, "Choose a content report to remove content")
        collection, _, _ = REPORT_TARGETS[report["kind"]]
        await db[collection].update_one(
            {"_id": ObjectId(report["target_id"])}, {"$set": {"moderation_hidden": True}},
        )
    elif body.action == "suspend":
        subject_id = report.get("subject_user_id")
        if not ObjectId.is_valid(subject_id):
            raise HTTPException(400, "No author account is available")
        result = await db.users.update_one(
            {"_id": ObjectId(subject_id), "role": {"$ne": "admin"}},
            {"$set": {"suspended": True}, "$inc": {"mobile_session_version": 1}},
        )
        if result.matched_count != 1:
            raise HTTPException(400, "This account must be managed outside the moderation queue")
        await db.mobile_sessions.delete_many({"user_id": ObjectId(subject_id)})
    await db.content_reports.update_one(
        {"_id": report_id, "status": "pending"},
        {"$set": {"status": body.action, "reviewer_id": str(user["_id"]), "resolved_at": now_iso()}},
    )
    return {"ok": True}


@api.get("/moderation/suspended")
async def suspended_accounts(user: dict = Depends(require("manage_roles"))):
    members = await db.users.find({"suspended": True}, {"name": 1}).to_list(100)
    return [{"id": str(member["_id"]), "name": member.get("name")} for member in members]


@api.delete("/moderation/suspended/{uid}")
async def restore_account(uid: str, user: dict = Depends(require("manage_roles"))):
    if not ObjectId.is_valid(uid):
        raise HTTPException(404, "Account not found")
    await db.users.update_one({"_id": ObjectId(uid)}, {"$unset": {"suspended": ""}})
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
    require_community_terms(user)
    filter_text(body.message)
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
        "location_id": i.get("location_id"),
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
    if body.access != "staff" and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can invite managers or admins")
    campus = body.campus.strip() if body.campus else None
    location_id = None
    if body.location_id:
        try:
            location = await db.locations.find_one({"_id": ObjectId(body.location_id)})
        except Exception:
            location = None
        if not location:
            raise HTTPException(status_code=404, detail="Campus not found")
    elif campus:
        location = await db.locations.find_one({"campus_code": campus.upper()}) or await db.locations.find_one({"name": campus})
    else:
        location = None
    if location:
        campus = location["name"]
        location_id = str(location["_id"])
    doc = {
        "code": gen_code(10),
        "channel": body.channel,
        "value": body.value,
        "campus": campus,
        "location_id": location_id,
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
def serialize_location(location: dict) -> dict:
    return {
        "id": str(location["_id"]),
        "name": location.get("name"),
        "campus_code": location.get("campus_code"),
        "website_url": location.get("website_url"),
        "logo_url": location.get("logo_url"),
        "primary_color": location.get("primary_color", "#1B2A4A"),
        "accent_color": location.get("accent_color", "#00A5A8"),
        "soft_color": location.get("soft_color", "#E8F1F5"),
    }


@api.get("/public/campuses/{code}")
async def public_campus_brand(code: str):
    normalized = code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,16}", normalized):
        raise HTTPException(status_code=404, detail="Campus not found")
    location = await db.locations.find_one({"campus_code": normalized})
    if not location:
        raise HTTPException(status_code=404, detail="Campus not found")
    brand = serialize_location(location)
    return {key: brand[key] for key in ("name", "campus_code", "website_url", "logo_url", "primary_color", "accent_color", "soft_color")}


@api.get("/locations")
async def list_locations(user: dict = Depends(get_current_user)):
    items = await db.locations.find().to_list(500)
    return [serialize_location(location) for location in items]


@api.post("/locations")
async def create_location(body: LocationBody, user: dict = Depends(require("manage_locations"))):
    if await db.locations.find_one({"campus_code": body.campus_code}):
        raise HTTPException(status_code=409, detail="Campus code already exists")
    doc = {**body.model_dump(), "created_at": now_iso()}
    res = await db.locations.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_location(doc)


@api.put("/locations/{lid}")
async def update_location(lid: str, body: LocationBody, user: dict = Depends(require("manage_locations"))):
    try:
        location_id = ObjectId(lid)
    except Exception:
        raise HTTPException(status_code=404, detail="Location not found")
    existing = await db.locations.find_one({"_id": location_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Location not found")
    duplicate = await db.locations.find_one({"campus_code": body.campus_code})
    if duplicate and duplicate["_id"] != location_id:
        raise HTTPException(status_code=409, detail="Campus code already exists")
    updates = {**body.model_dump(), "updated_at": now_iso()}
    await db.locations.update_one({"_id": location_id}, {"$set": updates})
    return serialize_location({**existing, **updates})


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
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
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
    """Serve content-hashed build assets with long-lived caching."""

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
        await db.mobile_sessions.create_index("refresh_digest", unique=True)
        await db.mobile_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.mobile_sessions.create_index("user_id")
        await db.content_reports.create_index([("status", 1), ("created_at", 1)])
    except Exception as e:
        logger.warning(f"index setup: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
