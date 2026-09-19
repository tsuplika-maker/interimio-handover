CONTACT_PATTERNS = [
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    re.compile(r"(?:https?://|www\.)\S+", re.I),
    re.compile(r"\b[\w-]+\.(?:com|de|io|net|org|eu|ch|at|co|info|biz)\b(?:/\S*)?", re.I),
    re.compile(r"(?:\+|00)?\d[\d\s().\-/]{6,}\d"),
]


def redact_contacts(text: str) -> str:
    out = text
    for p in CONTACT_PATTERNS:
        out = p.sub("[hidden until release]", out)
    return out



class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ReleaseInput(BaseModel):
    released: bool



# ---------------------- Messaging ----------------------
async def create_conversation(ctype: str, participants: List[str], title: str, lead_id: Optional[str] = None, manager_id: Optional[str] = None) -> Dict:
    conv = {
        "id": str(uuid.uuid4()), "type": ctype, "title": title, "participant_ids": participants,
        "lead_id": lead_id, "manager_id": manager_id, "contact_released": ctype != "lead",
        "last_message_at": now_iso(), "last_message_preview": "", "unread": {}, "admin_unread": 0,
        "notified_at": {}, "created_at": now_iso(),
    }
    await db.conversations.insert_one(dict(conv))
    return conv


def can_access(conv: Dict, user: Dict) -> bool:
    return user.get("role") == "admin" or user["id"] in conv.get("participant_ids", [])


def message_view(msg: Dict, conv: Dict, viewer: Dict) -> Dict:
    body = msg["body"]
    redacted = False
    if conv.get("type") == "lead" and not conv.get("contact_released") and viewer.get("role") != "admin":
        red = redact_contacts(body)
        redacted = red != body
        body = red
    return {"id": msg["id"], "conversation_id": msg["conversation_id"], "sender_id": msg["sender_id"],
            "sender_role": msg["sender_role"], "sender_email": msg.get("sender_email"), "body": body,
            "redacted": redacted, "created_at": msg["created_at"]}


async def notify_participants(conv: Dict, sender: Dict, preview: str):
    notified = conv.get("notified_at", {}) or {}
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    recipients = [p for p in conv.get("participant_ids", []) if p != sender["id"]]
    if sender.get("role") != "admin":
        admins = await db.users.find({"role": "admin"}, {"id": 1}).to_list(length=20)
        recipients += [a["id"] for a in admins if a["id"] not in recipients]
    for rid in recipients:
        last = notified.get(rid)
        if last and datetime.fromisoformat(last) > cutoff:
            continue
        u = await db.users.find_one({"id": rid})
        if not u:
            continue
        html = f"""<div style='font-family: Montserrat, Arial; line-height:1.6'>
            <h2 style='margin:0 0 8px'>New message on Interimio</h2>
            <p><b>{conv.get('title')}</b></p>
            <p style='background:#f2f6fb;padding:12px;border-radius:8px'>{redact_contacts(preview)[:300]}</p>
            <p><a href='{FRONTEND_URL}/messages?c={conv['id']}' style='background:#0b6bcb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none'>Open conversation</a></p></div>"""
        if not await send_email_async(u["email"], f"New message: {conv.get('title')}", html):
            logger.info(f"[DEV MAIL] message notification to {u['email']} for conv {conv['id']}")
        notified[rid] = now_iso()
    await db.conversations.update_one({"id": conv["id"]}, {"$set": {"notified_at": notified}})


async def post_message(conv: Dict, sender: Dict, body: str) -> Dict:
    msg = {"id": str(uuid.uuid4()), "conversation_id": conv["id"], "sender_id": sender["id"],
           "sender_role": sender.get("role"), "sender_email": sender.get("email"), "body": body, "created_at": now_iso()}
    await db.messages.insert_one(dict(msg))
    inc = {f"unread.{p}": 1 for p in conv.get("participant_ids", []) if p != sender["id"]}
    if sender.get("role") != "admin":
        inc["admin_unread"] = 1
    update: Dict = {"$set": {"last_message_at": msg["created_at"], "last_message_preview": body[:120]}}
    if inc:
        update["$inc"] = inc
    await db.conversations.update_one({"id": conv["id"]}, update)
    await notify_participants(conv, sender, body)
    return msg


def conversation_view(conv: Dict, user: Dict) -> Dict:
    unread = conv.get("admin_unread", 0) if user.get("role") == "admin" else (conv.get("unread", {}) or {}).get(user["id"], 0)
    return {"id": conv["id"], "type": conv["type"], "title": conv["title"], "participant_ids": conv.get("participant_ids", []),
            "lead_id": conv.get("lead_id"), "manager_id": conv.get("manager_id"), "contact_released": conv.get("contact_released", False),
            "last_message_at": conv.get("last_message_at"), "last_message_preview": conv.get("last_message_preview", ""),
            "unread": unread, "created_at": conv.get("created_at"), "participants": conv.get("participants", [])}


async def attach_participants(convs: List[Dict]) -> None:
    ids = {p for c in convs for p in c.get("participant_ids", [])}
    users = await db.users.find({"id": {"$in": list(ids)}}, {"id": 1, "email": 1, "role": 1}).to_list(length=1000)
    by_id = {u["id"]: {"id": u["id"], "email": u["email"], "role": u.get("role")} for u in users}
    for c in convs:
        c["participants"] = [by_id[p] for p in c.get("participant_ids", []) if p in by_id]


@api_router.get("/conversations")
async def list_conversations(user=Depends(get_current_user)):
    filt = {} if user.get("role") == "admin" else {"participant_ids": user["id"]}
    convs = await db.conversations.find(filt).sort("last_message_at", -1).to_list(length=300)
    await attach_participants(convs)
    return [conversation_view(c, user) for c in convs]


@api_router.get("/conversations/unread-count")
async def unread_count(user=Depends(get_current_user)):
    if user.get("role") == "admin":
        agg = await db.conversations.aggregate([{"$group": {"_id": None, "n": {"$sum": "$admin_unread"}}}]).to_list(length=1)
        return {"unread": agg[0]["n"] if agg else 0}
    convs = await db.conversations.find({"participant_ids": user["id"]}, {"unread": 1}).to_list(length=300)
    return {"unread": sum((c.get("unread", {}) or {}).get(user["id"], 0) for c in convs)}


@api_router.post("/conversations/support")
async def get_or_create_support_conversation(user=Depends(get_current_user)):
    if user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admins reply from the inbox")
    conv = await db.conversations.find_one({"type": "support", "participant_ids": user["id"]})
    if not conv:
        conv = await create_conversation("support", [user["id"]], f"Interimio team ↔ {user['email']}")
    await attach_participants([conv])
    return conversation_view(conv, user)


@api_router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id})
    if not conv or not can_access(conv, user):
        raise HTTPException(status_code=404, detail="Conversation not found")
    await attach_participants([conv])
    return conversation_view(conv, user)


@api_router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: str, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id})
    if not conv or not can_access(conv, user):
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = await db.messages.find({"conversation_id": conv_id}).sort("created_at", 1).to_list(length=1000)
    reset = {"admin_unread": 0} if user.get("role") == "admin" else {f"unread.{user['id']}": 0}
    await db.conversations.update_one({"id": conv_id}, {"$set": reset})
    return [message_view(m, conv, user) for m in msgs]


@api_router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, input: MessageInput, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id})
    if not conv or not can_access(conv, user):
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not user.get("email_verified", False) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Email verification required")
    msg = await post_message(conv, user, input.body.strip())
    return message_view(msg, conv, user)


@api_router.patch("/conversations/{conv_id}/release")
async def release_contacts(conv_id: str, input: ReleaseInput, admin=Depends(require_admin)):
    res = await db.conversations.update_one({"id": conv_id}, {"$set": {"contact_released": input.released}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"id": conv_id, "contact_released": input.released}


