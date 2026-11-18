import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument

from auth import create_access_token

ACCESS_LIFETIME = timedelta(minutes=15)
SESSION_LIFETIME = timedelta(days=30)


def refresh_digest(credential: str) -> str:
    return hashlib.sha256(credential.encode()).hexdigest()


def session_response(session, user, credential):
    return {
        "access_token": create_access_token(
            str(user["_id"]), user["email"], session_id=str(session["_id"]),
            lifetime=ACCESS_LIFETIME,
        ),
        "refresh_token": credential,
    }


async def start_session(db, user):
    credential = secrets.token_urlsafe(32)
    session = {
        "_id": ObjectId(),
        "user_id": user["_id"],
        "user_version": user.get("mobile_session_version", 0),
        "refresh_digest": refresh_digest(credential),
        "expires_at": datetime.now(timezone.utc) + SESSION_LIFETIME,
    }
    await db.mobile_sessions.insert_one(session)
    return session_response(session, user, credential)


async def rotate_session(db, credential):
    next_credential = secrets.token_urlsafe(32)
    session = await db.mobile_sessions.find_one_and_update(
        {
            "refresh_digest": refresh_digest(credential),
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        },
        {"$set": {"refresh_digest": refresh_digest(next_credential)}},
        return_document=ReturnDocument.AFTER,
    )
    if session is None:
        raise HTTPException(401, "Session expired. Sign in again.")
    user = await db.users.find_one({"_id": session["user_id"]})
    if not user or user.get("suspended") or session["user_version"] != user.get("mobile_session_version", 0):
        await db.mobile_sessions.delete_one({"_id": session["_id"]})
        raise HTTPException(401, "Session expired. Sign in again.")
    return session_response(session, user, next_credential), user


async def session_is_active(db, session_id, user):
    if not ObjectId.is_valid(session_id):
        return False
    return await db.mobile_sessions.find_one({
        "_id": ObjectId(session_id),
        "user_id": user["_id"],
        "user_version": user.get("mobile_session_version", 0),
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    }, {"_id": 1}) is not None
