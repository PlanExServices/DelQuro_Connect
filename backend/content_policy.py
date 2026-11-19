import os
import re
import unicodedata
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel

TERMS_VERSION = "1"
ReportKind = Literal["post", "comment", "message", "member", "chat", "schedule"]
ReportReason = Literal["harassment", "private_information", "inappropriate_content", "spam", "other"]
ModerationAction = Literal["dismiss", "remove", "suspend"]

# Each entry names the collection, owner field and fields shown to moderators.
REPORT_TARGETS = {
    "post": ("posts", "author_id", ("title", "content")),
    "comment": ("comments", "author_id", ("text",)),
    "message": ("messages", "sender_id", ("text",)),
    "member": ("users", None, ("name",)),
    "chat": ("chats", "creator_id", ("name", "description")),
    "schedule": ("schedules", "uploader_id", ("title",)),
}
VISIBLE = {"moderation_hidden": {"$ne": True}}


def normalize(text):
    text = unicodedata.normalize("NFKC", text).casefold()
    text = "".join(char for char in text if unicodedata.category(char) != "Cf")
    return " ".join(re.findall(r"\w+", text))


def filter_text(*parts):
    text = f" {normalize(' '.join(part for part in parts if part))} "
    additional = os.environ.get("MODERATION_BLOCKED_PHRASES", "").split("|")
    blocked = ["kill yourself", "i will kill you", *additional]
    for phrase in blocked:
        normalized = normalize(phrase)
        if normalized and f" {normalized} " in text:
            raise HTTPException(400, "This content conflicts with the Community Guidelines.")


def visible_from(field, user):
    return {**VISIBLE, field: {"$nin": user.get("blocked_user_ids", [])}}


class ContentReport(BaseModel):
    kind: ReportKind
    target_id: str
    reason: ReportReason


class ReviewReport(BaseModel):
    action: ModerationAction
