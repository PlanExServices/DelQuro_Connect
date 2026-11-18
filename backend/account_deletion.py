from bson import ObjectId


async def purge_account_data(db, user):
    user_id = user["_id"]
    uid = str(user_id)
    attachment_ids = set()
    async for post in db.posts.find({"author_id": uid}, {"image_id": 1}):
        attachment_ids.add(post.get("image_id"))
        await db.comments.delete_many({"post_id": str(post["_id"])})
    async for message in db.messages.find({"sender_id": uid}, {"image_id": 1}):
        attachment_ids.add(message.get("image_id"))
    async for attachment in db.files.find({"owner_id": uid}, {"_id": 1}):
        attachment_ids.add(str(attachment["_id"]))
    # Remove private uploads before their references, so a retry can still
    # find older uploads that predate the owner field.
    for file_id in (item for item in attachment_ids if ObjectId.is_valid(item)):
        shared_post = await db.posts.find_one({"image_id": file_id, "author_id": {"$ne": uid}}, {"_id": 1})
        shared_message = await db.messages.find_one({"image_id": file_id, "sender_id": {"$ne": uid}}, {"_id": 1})
        schedule = await db.schedules.find_one({"file_id": file_id}, {"_id": 1})
        if not (shared_post or shared_message or schedule):
            await db.files.delete_one({"_id": ObjectId(file_id)})
        else:
            await db.files.update_one({"_id": ObjectId(file_id), "owner_id": uid}, {"$unset": {"owner_id": ""}})
    await db.posts.delete_many({"author_id": uid})
    await db.posts.update_many(
        {"$or": [{"likes": uid}, {"acknowledged_by": uid}]},
        {"$pull": {"likes": uid, "acknowledged_by": uid}},
    )
    await db.comments.delete_many({"author_id": uid})
    await db.messages.delete_many({"sender_id": uid})
    await db.messages.update_many({"read_by": uid}, {"$pull": {"read_by": uid}})
    await db.kudos.delete_many({"$or": [{"to_id": uid}, {"from_id": uid}]})
    await db.timeoff.delete_many({"user_id": uid})
    await db.chats.update_many({"member_ids": uid}, {"$pull": {"member_ids": uid}})
    await db.chats.update_many({"creator_id": uid}, {"$unset": {"creator_id": ""}})
    await db.schedules.update_many({"uploader_id": uid}, {"$unset": {"uploader_id": ""}})
    await db.invites.delete_many({"$or": [{"creator_id": uid}, {"registered_user_id": uid}, {"value": user["email"]}]})
    await db.login_attempts.delete_many({"identifier": user["email"]})
    await db.content_reports.delete_many({"$or": [{"reporter_id": uid}, {"subject_user_id": uid}]})
    await db.content_reports.update_many({"reviewer_id": uid}, {"$unset": {"reviewer_id": ""}})
    await db.users.update_many({"blocked_user_ids": uid}, {"$pull": {"blocked_user_ids": uid}})
    await db.mobile_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"_id": user_id})
