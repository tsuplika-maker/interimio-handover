from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, date, time, timezone, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
import random
import re
import smtplib
import asyncio
from email.message import EmailMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# App
app = FastAPI(title="Interimio API")
api_router = APIRouter(prefix="/api")

# ---------------------- Config & Helpers ----------------------
BASE_SUBSCRIPTION_EUR = 299

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("JWT_SECRET_KEY") or "dev-secret-change-me"
JWT_ALG = "HS256"
ACCESS_MIN = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL") or SMTP_USER or "noreply@example.com"
SENDER_NAME = os.environ.get("SENDER_NAME", "Interimio")
SMTP_CONFIGURED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)
EMAIL_DEV_MODE = "true" if not SMTP_CONFIGURED else os.environ.get("EMAIL_DEV_MODE", "false")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_for_mongo(data: Dict) -> Dict:
    d = dict(data)
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.astimezone(timezone.utc).isoformat()
        elif isinstance(v, date):
            d[k] = v.isoformat()
        elif isinstance(v, time):
            d[k] = v.strftime('%H:%M:%S')
    return d


async def ensure_indexes():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("phone")
        await db.otps.create_index("user_id")
        await db.otps.create_index("expires_at")
        await db.managers.create_index("created_at")
        await db.courses.create_index("created_at")
        await db.lessons.create_index("course_id")
        await db.enrollments.create_index([("user_id", 1), ("course_id", 1)], unique=True)
        await db.podcasts.create_index("publish_date")
        await db.conversations.create_index("participant_ids")
        await db.conversations.create_index("last_message_at")
        await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(p: str, hashed: str) -> bool:
    return pwd_context.verify(p, hashed)


def create_access_token(sub: str, extra: Dict) -> str:
    payload = {
        "sub": sub,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MIN),
        **extra,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def send_email(to_email: str, subject: str, html: str) -> bool:
    if not SMTP_CONFIGURED:
        return False
    msg = EmailMessage()
    msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(re.sub(r"<[^>]+>", "", html))
    msg.add_alternative(html, subtype="html")
    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        logger.info(f"SMTP mail sent to {to_email}")
        return True
    except Exception as e:  # pragma: no cover
        logger.error(f"SMTP send failed: {e}")
        return False


async def send_email_async(to_email: str, subject: str, html: str) -> bool:
    return await asyncio.to_thread(send_email, to_email, subject, html)


async def send_email_code(to_email: str, code: str) -> bool:
    """Send OTP code via SMTP if configured. Returns True if sent."""
    return await send_email_async(to_email, "Your Interimio verification code", f"""
                <div style='font-family: Montserrat, Arial; line-height:1.6'>
                  <h2 style='margin:0 0 8px'>Verify your email</h2>
                  <p>Your one-time verification code is:</p>
                  <div style='font-size:28px;font-weight:700;background:#0b6bcb;color:#fff;padding:12px 16px;border-radius:8px;display:inline-block;letter-spacing:3px'>{code}</div>
                  <p style='margin-top:12px'>This code expires in 10 minutes. If you didn’t request it, you can ignore this message.</p>
                </div>
            """)


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


async def get_current_user(request: Request) -> Dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user=Depends(get_current_user)) -> Dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def seed_admin():
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        logger.warning("ADMIN_EMAIL/ADMIN_PASSWORD not set; admin not seeded")
        return
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "phone": None,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "email_verified": True,
            "phone_verified": False,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
        logger.info("Admin user seeded")
    elif existing.get("role") != "admin" or not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {
            "role": "admin", "email_verified": True,
            "password_hash": hash_password(ADMIN_PASSWORD), "updated_at": now_iso(),
        }})


# ---------------------- Models ----------------------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: str = Field(default_factory=now_iso)


class StatusCheckCreate(BaseModel):
    client_name: str


class ManagerCreate(BaseModel):
    name: str
    title: str
    location: str
    daily_rate_eur: int
    bio: Optional[str] = None
    skills: List[str] = []
    image_url: Optional[str] = None
    availability_start: Optional[date] = None
    availability_end: Optional[date] = None
    industries: List[str] = []
    languages: List[str] = []
    years_experience: Optional[int] = None
    linkedin_url: Optional[str] = None
    highlights: List[str] = []
    about: Optional[str] = None


class Manager(ManagerCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class LeadCreate(BaseModel):
    manager_id: str
    company_name: str
    contact_name: str
    email: EmailStr
    start_date: Optional[date] = None
    days: int
    daily_rate_eur: int
    message: Optional[str] = None


class Lead(LeadCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)
    fee_eur: int
    status: str = "new"
    manager_name: Optional[str] = None
    client_user_id: Optional[str] = None
    conversation_id: Optional[str] = None


class LeadStatusUpdate(BaseModel):
    status: str


class DiscountCodeUpdate(BaseModel):
    is_active: Optional[bool] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class ProInterestInput(BaseModel):
    discount_code: Optional[str] = None


class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ReleaseInput(BaseModel):
    released: bool


class DiscountCodeCreate(BaseModel):
    code: str
    percent_off: Optional[int] = None
    amount_off_eur: Optional[int] = None
    is_active: bool = True
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class DiscountCode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    percent_off: Optional[int] = None
    amount_off_eur: Optional[int] = None
    is_active: bool = True
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# Auth models
class RegisterInput(BaseModel):
    email: EmailStr
    phone: Optional[str] = None
    password: str
    role: str = Field(pattern=r"^(manager|client)$")


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class OTPRequest(BaseModel):
    user_id: str
    method: str = Field(pattern=r"^(email|sms)$")


class OTPVerify(BaseModel):
    user_id: str
    method: str = Field(pattern=r"^(email|sms)$")
    code: str = Field(pattern=r"^\d{6}$")


# Learning models
class CourseCreate(BaseModel):
    title: str
    description: str
    cover_image_url: Optional[str] = None
    tags: List[str] = []
    level: Optional[str] = "Beginner"
    published: bool = True


class Course(CourseCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class LessonCreate(BaseModel):
    course_id: str
    title: str
    video_url: Optional[str] = None
    content: Optional[str] = None
    duration_minutes: Optional[int] = 5
    order: int = 1
    published: bool = True


class Lesson(LessonCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)


class EnrollmentCreate(BaseModel):
    course_id: str


class Enrollment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    course_id: str
    completed_lessons: List[str] = []
    progress_percent: int = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ProgressUpdate(BaseModel):
    course_id: str
    lesson_id: str
    completed: bool = True


# Podcast (Podigee)
class PodcastEpisodeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    podigee_iframe_url: Optional[str] = None
    publish_date: Optional[str] = Field(default_factory=lambda: datetime.now(timezone.utc).date().isoformat())


class PodcastEpisode(PodcastEpisodeCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=now_iso)


# ---------------------- Core Routes ----------------------
@api_router.get("/")
async def root():
    return {"message": "Interimio API ready"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(client_name=input.client_name)
    await db.status_checks.insert_one(prepare_for_mongo(status_obj.model_dump()))
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**sc) for sc in status_checks]


# ---------------------- Managers ----------------------
@api_router.post("/managers", response_model=Manager)
async def create_manager(manager: ManagerCreate, user=Depends(get_current_user)):
    # Only verified managers can create/update their own profile (free)
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager account required")
    if not user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email verification required")
    existing = await db.managers.find_one({"user_id": user["id"]})
    if existing:
        update = prepare_for_mongo(manager.model_dump())
        update["updated_at"] = now_iso()
        await db.managers.update_one({"id": existing["id"]}, {"$set": update})
        doc = await db.managers.find_one({"id": existing["id"]})
        return Manager(**doc)
    m = Manager(**manager.model_dump(), user_id=user["id"])
    await db.managers.insert_one(prepare_for_mongo(m.model_dump()))
    return m


@api_router.get("/managers/me")
async def my_manager_profile(user=Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager account required")
    doc = await db.managers.find_one({"user_id": user["id"]})
    return Manager(**doc) if doc else None


@api_router.get("/managers/{manager_id}", response_model=Manager)
async def get_manager(manager_id: str):
    doc = await db.managers.find_one({"id": manager_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Manager not found")
    return Manager(**doc)


@api_router.get("/managers", response_model=List[Manager])
async def list_managers(
    q: Optional[str] = Query(None, description="Search text"),
    location: Optional[str] = Query(None),
    min_rate: Optional[int] = Query(None),
    max_rate: Optional[int] = Query(None),
    limit: int = Query(30, ge=1, le=200),
):
    filters: Dict = {}
    clauses: List[Dict] = []

    if q:
        regex = {"$regex": q, "$options": "i"}
        clauses.append({"name": regex})
        clauses.append({"title": regex})
        clauses.append({"skills": regex})
    if location:
        clauses.append({"location": {"$regex": location, "$options": "i"}})

    if clauses:
        filters["$or"] = clauses

    if min_rate is not None or max_rate is not None:
        rate_filter: Dict = {}
        if min_rate is not None:
            rate_filter["$gte"] = min_rate
        if max_rate is not None:
            rate_filter["$lte"] = max_rate
        filters["daily_rate_eur"] = rate_filter

    docs = await db.managers.find(filters).sort("created_at", -1).to_list(length=limit)
    return [Manager(**doc) for doc in docs]


@api_router.post("/managers/seed")
async def seed_managers(admin=Depends(require_admin)):
    existing = await db.managers.count_documents({})
    if existing > 0:
        return {"created": 0, "message": "Managers already exist"}

    samples = [
        {
            "name": "Anna Richter",
            "title": "Interim CFO",
            "location": "Berlin, DE",
            "daily_rate_eur": 1200,
            "bio": "Finance leader with 15+ years in turnaround, FP&A, and M&A integration.",
            "skills": ["Turnaround", "FP&A", "M&A"],
            "image_url": "https://images.unsplash.com/photo-1736939678218-bd648b5ef3bb",
        },
        {
            "name": "Lukas Meyer",
            "title": "Interim CTO",
            "location": "Munich, DE",
            "daily_rate_eur": 1400,
            "bio": "Scales product engineering, cloud cost optimization, security by design.",
            "skills": ["Cloud", "Security", "SRE"],
            "image_url": "https://images.unsplash.com/photo-1542744173-8e7e53415bb0",
        },
        {
            "name": "Sophie Keller",
            "title": "Interim COO",
            "location": "Hamburg, DE",
            "daily_rate_eur": 1100,
            "bio": "Operational excellence, lean, and supply chain resilience.",
            "skills": ["Lean", "Supply Chain", "Ops"],
            "image_url": "https://images.unsplash.com/39/lIZrwvbeRuuzqOoWJUEn_Photoaday_CSD%20(1%20of%201)-5.jpg",
        },
        {
            "name": "Marco Rossi",
            "title": "Interim Sales Director",
            "location": "Milan, IT",
            "daily_rate_eur": 950,
            "bio": "Builds B2B pipelines, SDR playbooks, and European channel partnerships.",
            "skills": ["B2B Sales", "Playbooks", "Partnerships"],
            "image_url": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40",
        },
        {
            "name": "Claire Dubois",
            "title": "Interim HR Director",
            "location": "Paris, FR",
            "daily_rate_eur": 800,
            "bio": "Org design, compensation frameworks, and leadership coaching.",
            "skills": ["Org Design", "Compensation", "Coaching"],
            "image_url": "https://images.pexels.com/photos/2977565/pexels-photo-2977565.jpeg",
        },
        {
            "name": "Tom Becker",
            "title": "Interim Product Lead",
            "location": "Cologne, DE",
            "daily_rate_eur": 1000,
            "bio": "PLG strategy, discovery, and cross-functional delivery.",
            "skills": ["PLG", "Discovery", "Delivery"],
            "image_url": "https://images.pexels.com/photos/2977547/pexels-photo-2977547.jpeg",
        },
    ]

    extras = [
        {"industries": ["Manufacturing", "Automotive"], "languages": ["German", "English"], "years_experience": 18, "highlights": ["Led €120M turnaround for Tier-1 supplier", "Post-merger integration of 3 entities", "Set up FP&A from scratch"], "about": "I step in when finance functions need stability fast — building cash transparency, restoring lender trust, and coaching the team to run on their own."},
        {"industries": ["SaaS", "FinTech"], "languages": ["German", "English"], "years_experience": 15, "highlights": ["Scaled engineering from 20 to 120", "Cut cloud spend 35%", "ISO 27001 in 9 months"], "about": "Hands-on interim CTO for scale-ups that need architecture clarity, delivery cadence, and security that satisfies enterprise buyers."},
        {"industries": ["Logistics", "Retail"], "languages": ["German", "English", "Dutch"], "years_experience": 14, "highlights": ["Reduced OTIF misses by 60%", "Rolled out lean across 5 sites"], "about": "Operations leader focused on resilient supply chains and measurable execution."},
        {"industries": ["Industrial", "B2B Services"], "languages": ["Italian", "English", "German"], "years_experience": 12, "highlights": ["Built 40-person European SDR org", "Doubled pipeline in 2 quarters"], "about": "Sales director who builds repeatable B2B revenue engines across European markets."},
        {"industries": ["Pharma", "Consulting"], "languages": ["French", "English"], "years_experience": 16, "highlights": ["Org redesign for 2,000 FTE", "New compensation framework post-acquisition"], "about": "HR leader for transformation phases: org design, talent, and culture that sticks."},
        {"industries": ["E-Commerce", "Media"], "languages": ["German", "English"], "years_experience": 11, "highlights": ["Launched PLG motion to 30% of new ARR", "Reset roadmap and discovery process"], "about": "Product lead bridging strategy and delivery in cross-functional teams."},
    ]
    created = 0
    for s, ex in zip(samples, extras):
        m = Manager(**s, **ex)
        await db.managers.insert_one(prepare_for_mongo(m.model_dump()))
        created += 1

    return {"created": created}


# ---------------------- Leads & fee (gated) ----------------------
@api_router.post("/leads", response_model=Lead)
async def create_lead(lead: LeadCreate, user=Depends(get_current_user)):
    # Only verified clients can contact
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client account required")
    if not user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email verification required")

    manager = await db.managers.find_one({"id": lead.manager_id})
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found")

    fee = int(round(lead.daily_rate_eur * lead.days * 0.20))
    l = Lead(**lead.model_dump(), fee_eur=fee, manager_name=manager.get("name"), client_user_id=user["id"])
    participants = [user["id"]]
    if manager.get("user_id"):
        participants.append(manager["user_id"])
    conv = await create_conversation(
        ctype="lead", participants=participants, title=f"{lead.company_name} → {manager.get('name')}",
        lead_id=l.id, manager_id=manager["id"],
    )
    l.conversation_id = conv["id"]
    await db.leads.insert_one(prepare_for_mongo(l.model_dump()))
    intro = lead.message or f"Request for {lead.days} days starting {lead.start_date or 'TBD'}."
    await post_message(conv, user, intro)
    return l


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


# ---------------------- Pro interest (managers, free tier) ----------------------
@api_router.post("/pro/interest")
async def register_pro_interest(input: ProInterestInput, user=Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager account required")
    code = (input.discount_code or "").strip().upper() or None
    code_valid = False
    if code:
        dc = await db.discount_codes.find_one({"code": code, "is_active": True})
        code_valid = dc is not None
        if code_valid:
            await db.discount_redemptions.insert_one({
                "id": str(uuid.uuid4()), "code": code, "user_id": user["id"],
                "email": user["email"], "context": "pro_interest", "created_at": now_iso(),
            })
    await db.pro_interest.update_one(
        {"user_id": user["id"]},
        {"$set": {"email": user["email"], "discount_code": code if code_valid else None, "updated_at": now_iso()},
         "$setOnInsert": {"id": str(uuid.uuid4()), "user_id": user["id"], "created_at": now_iso()}},
        upsert=True,
    )
    return {"registered": True, "code_valid": code_valid}


# ---------------------- Admin ----------------------
def lead_csv_row(l: Dict) -> str:
    cols = ["created_at", "status", "manager_name", "company_name", "contact_name", "email", "start_date", "days", "daily_rate_eur", "fee_eur", "message"]
    out = []
    for c in cols:
        v = l.get(c)
        if c == "status":
            v = v or "new"
        v = "" if v is None else str(v).replace('"', '""')
        out.append(f'"{v}"')
    return ",".join(out)


class TestEmailInput(BaseModel):
    to: EmailStr


@api_router.post("/admin/test-email")
async def admin_test_email(input: TestEmailInput, admin=Depends(require_admin)):
    if not SMTP_CONFIGURED:
        raise HTTPException(status_code=400, detail="SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD)")
    ok = await send_email_async(input.to, "Interimio test email", "<p>SMTP delivery works. Greetings from Interimio.</p>")
    if not ok:
        raise HTTPException(status_code=502, detail="SMTP send failed – check backend logs")
    return {"sent": True, "to": input.to, "from": SENDER_EMAIL, "host": SMTP_HOST}


@api_router.get("/admin/stats")
async def admin_stats(admin=Depends(require_admin)):
    leads = await db.leads.find({}, {"fee_eur": 1, "status": 1}).to_list(length=5000)
    return {
        "users_total": await db.users.count_documents({}),
        "clients": await db.users.count_documents({"role": "client"}),
        "managers_users": await db.users.count_documents({"role": "manager"}),
        "manager_profiles": await db.managers.count_documents({}),
        "leads_total": len(leads),
        "leads_new": sum(1 for l in leads if l.get("status", "new") == "new"),
        "fees_total_eur": sum(int(l.get("fee_eur", 0)) for l in leads),
        "pro_interest": await db.pro_interest.count_documents({}),
        "discount_codes_active": await db.discount_codes.count_documents({"is_active": True}),
    }


@api_router.get("/admin/leads")
async def admin_list_leads(status: Optional[str] = Query(None), q: Optional[str] = Query(None), admin=Depends(require_admin)):
    filt: Dict = {}
    if status and status != "all":
        filt["status"] = status
    if q:
        regex = {"$regex": q, "$options": "i"}
        filt["$or"] = [{"company_name": regex}, {"contact_name": regex}, {"email": regex}, {"manager_name": regex}]
    docs = await db.leads.find(filt, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    for d in docs:
        d.setdefault("status", "new")
    return docs


@api_router.patch("/admin/leads/{lead_id}")
async def admin_update_lead(lead_id: str, upd: LeadStatusUpdate, admin=Depends(require_admin)):
    if upd.status not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {LEAD_STATUSES}")
    res = await db.leads.update_one({"id": lead_id}, {"$set": {"status": upd.status, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"id": lead_id, "status": upd.status}


@api_router.get("/admin/leads/export")
async def admin_export_leads(status: Optional[str] = Query(None), admin=Depends(require_admin)):
    filt: Dict = {}
    if status and status != "all":
        filt["status"] = status
    docs = await db.leads.find(filt, {"_id": 0}).sort("created_at", -1).to_list(length=5000)
    header = "created_at,status,manager,company,contact,email,start_date,days,daily_rate_eur,fee_eur,message"
    body = "\n".join([header] + [lead_csv_row(d) for d in docs])
    return Response(content=body, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=interimio-leads.csv"})


@api_router.get("/admin/discount-codes")
async def admin_list_discount_codes(admin=Depends(require_admin)):
    docs = await db.discount_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    for d in docs:
        d["uses"] = await db.discount_redemptions.count_documents({"code": d["code"]})
    return docs


@api_router.patch("/admin/discount-codes/{code_id}")
async def admin_update_discount_code(code_id: str, upd: DiscountCodeUpdate, admin=Depends(require_admin)):
    changes = {k: v for k, v in upd.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.discount_codes.update_one({"id": code_id}, {"$set": changes})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Code not found")
    doc = await db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    return doc


@api_router.delete("/admin/discount-codes/{code_id}")
async def admin_delete_discount_code(code_id: str, admin=Depends(require_admin)):
    res = await db.discount_codes.delete_one({"id": code_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Code not found")
    return {"deleted": True}


@api_router.get("/admin/discount-codes/{code_id}/redemptions")
async def admin_code_redemptions(code_id: str, admin=Depends(require_admin)):
    dc = await db.discount_codes.find_one({"id": code_id})
    if not dc:
        raise HTTPException(status_code=404, detail="Code not found")
    return await db.discount_redemptions.find({"code": dc["code"]}, {"_id": 0}).sort("created_at", -1).to_list(length=500)


# ---------------------- Discount codes ----------------------
@api_router.post("/discount-codes", response_model=DiscountCode)
async def create_discount_code(dc: DiscountCodeCreate, admin=Depends(require_admin)):
    dc.code = dc.code.strip().upper()
    if not dc.code:
        raise HTTPException(status_code=400, detail="Code required")
    existing = await db.discount_codes.find_one({"code": dc.code})
    if existing:
        raise HTTPException(status_code=400, detail="Code already exists")

    if dc.percent_off is None and dc.amount_off_eur is None:
        raise HTTPException(status_code=400, detail="Provide percent_off or amount_off_eur")
    if dc.percent_off is not None and (dc.percent_off < 0 or dc.percent_off > 100):
        raise HTTPException(status_code=400, detail="percent_off must be 0-100")

    code = DiscountCode(**dc.model_dump())
    await db.discount_codes.insert_one(prepare_for_mongo(code.model_dump()))
    return code


@api_router.get("/discount-codes/validate")
async def validate_discount(code: str = Query(...)):
    doc = await db.discount_codes.find_one({"code": code, "is_active": True})
    price = BASE_SUBSCRIPTION_EUR
    valid = False
    applied = None

    if doc:
        valid = True
        if doc.get("percent_off") is not None:
            pct = doc["percent_off"]
            price = int(round(price * (100 - pct) / 100))
            applied = {"percent_off": pct}
        elif doc.get("amount_off_eur") is not None:
            amt = doc["amount_off_eur"]
            price = max(0, price - int(amt))
            applied = {"amount_off_eur": int(amt)}

    return {
        "code": code,
        "valid": valid,
        "final_price_eur": price,
        "base_price_eur": BASE_SUBSCRIPTION_EUR,
        "applied": applied,
    }


@api_router.post("/discount-codes/seed")
async def seed_discount_codes(admin=Depends(require_admin)):
    samples = [
        {"code": "SHARE10", "percent_off": 10, "is_active": True, "assigned_to": "Shareholders"},
        {"code": "PARTNER50", "amount_off_eur": 50, "is_active": True, "assigned_to": "Partners"},
        {"code": "VIP100", "amount_off_eur": 100, "is_active": True, "assigned_to": "VIP"},
    ]
    created = 0
    for s in samples:
        existing = await db.discount_codes.find_one({"code": s["code"]})
        if not existing:
            obj = DiscountCode(**s)
            await db.discount_codes.insert_one(prepare_for_mongo(obj.model_dump()))
            created += 1
    return {"created": created}


# ---------------------- Auth ----------------------
@api_router.post("/auth/register")
async def register(input: RegisterInput):
    exists = await db.users.find_one({"email": input.email})
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": input.email,
        "phone": input.phone,
        "password_hash": hash_password(input.password),
        "role": input.role,
        "email_verified": False,
        "phone_verified": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.users.insert_one(user)
    # auto-send email OTP
    code = f"{random.randint(0, 999999):06d}"
    otp = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "method": "email",
        "code": code,
        "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat()+"Z",
        "used": False,
        "created_at": now_iso(),
    }
    await db.otps.insert_one(otp)
    sent = await send_email_code(input.email, code)
    if EMAIL_DEV_MODE == "true" or not sent:
        logger.info(f"[DEV OTP] Email code for {input.email}: {code}")
    return {"user_id": user["id"], "next": "verify_email"}


@api_router.post("/auth/send-otp")
async def send_otp(req: OTPRequest):
    user = await db.users.find_one({"id": req.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Only email for now
    if req.method != "email":
        raise HTTPException(status_code=400, detail="Only email OTP enabled")
    code = f"{random.randint(0, 999999):06d}"
    await db.otps.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "method": "email",
        "code": code,
        "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat()+"Z",
        "used": False,
        "created_at": now_iso(),
    })
    sent = await send_email_code(user['email'], code)
    if EMAIL_DEV_MODE == "true" or not sent:
        logger.info(f"[DEV OTP] Email code for {user['email']}: {code}")
    return {"sent": True}


@api_router.post("/auth/verify-otp")
async def verify_otp(req: OTPVerify):
    otp = await db.otps.find_one({
        "user_id": req.user_id,
        "method": req.method,
        "code": req.code,
        "used": False,
    })
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid code")
    # expiry check
    try:
        exp = datetime.fromisoformat(otp["expires_at"].replace("Z", "+00:00"))
    except Exception:
        exp = datetime.now(timezone.utc) - timedelta(seconds=1)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")
    # mark used
    await db.otps.update_one({"id": otp["id"]}, {"$set": {"used": True}})
    if req.method == "email":
        await db.users.update_one({"id": req.user_id}, {"$set": {"email_verified": True, "updated_at": now_iso()}})
    elif req.method == "sms":
        await db.users.update_one({"id": req.user_id}, {"$set": {"phone_verified": True, "updated_at": now_iso()}})
    return {"verified": True}


@api_router.post("/auth/login")
async def login(input: LoginInput):
    user = await db.users.find_one({"email": input.email})
    if not user or not verify_password(input.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], {
        "role": user.get("role", "client"),
        "email_verified": user.get("email_verified", False),
        "phone_verified": user.get("phone_verified", False),
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user.get("role", "client"),
            "email_verified": user.get("email_verified", False),
            "phone_verified": user.get("phone_verified", False),
        }
    }


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user.get("role", "client"),
        "email_verified": user.get("email_verified", False),
        "phone_verified": user.get("phone_verified", False),
    }


# ---------------------- Learning ----------------------
@api_router.post("/courses/seed")
async def seed_courses():
    existing = await db.courses.count_documents({})
    if existing > 0:
        return {"created": 0, "message": "Courses already exist"}

    c1 = Course(title="Interdisciplinary Leadership 101", description="Foundations of cross-functional leadership for interim managers.", cover_image_url=None, tags=["Leadership", "Communication"], level="Beginner")
    c2 = Course(title="Crisis to Clarity: Turnaround Essentials", description="Hands-on toolkit for stabilizing and turning around teams and P&L.", tags=["Turnaround", "Finance"], level="Intermediate")

    await db.courses.insert_many([prepare_for_mongo(c1.model_dump()), prepare_for_mongo(c2.model_dump())])

    lessons = [
        Lesson(course_id=c1.id, title="Role of the Interim Leader", video_url="https://www.youtube.com/embed/dQw4w9WgXcQ", content="Overview and expectations.", order=1),
        Lesson(course_id=c1.id, title="Stakeholder Mapping", video_url="https://www.youtube.com/embed/dQw4w9WgXcQ", content="Map influence and interests.", order=2),
        Lesson(course_id=c2.id, title="Cash & Liquidity", video_url="https://www.youtube.com/embed/dQw4w9WgXcQ", content="Cash-first mindset.", order=1),
        Lesson(course_id=c2.id, title="Communication in Crisis", video_url="https://www.youtube.com/embed/dQw4w9WgXcQ", content="Narratives that align.", order=2),
    ]
    await db.lessons.insert_many([prepare_for_mongo(l.model_dump()) for l in lessons])

    return {"created": 2, "lessons": len(lessons)}


@api_router.get("/courses", response_model=List[Course])
async def list_courses(q: Optional[str] = Query(None), level: Optional[str] = Query(None), tag: Optional[str] = Query(None), user=Depends(get_current_user)):
    filt: Dict = {"published": True}
    ors = []
    if q:
        ors.extend([{"title": {"$regex": q, "$options": "i"}}, {"tags": {"$regex": q, "$options": "i"}}])
    if tag:
        ors.append({"tags": {"$regex": tag, "$options": "i"}})
    if ors:
        filt["$or"] = ors
    if level and level.lower() != "all":
        filt["level"] = {"$regex": f"^{level}$", "$options": "i"}
    docs = await db.courses.find(filt).sort("created_at", -1).to_list(length=50)
    return [Course(**d) for d in docs]


@api_router.get("/courses/{course_id}")
async def get_course(course_id: str, user=Depends(get_current_user)):
    course = await db.courses.find_one({"id": course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    lessons = await db.lessons.find({"course_id": course_id, "published": True}).sort("order", 1).to_list(length=200)
    return {"course": Course(**course), "lessons": [Lesson(**l) for l in lessons]}


@api_router.post("/enrollments", response_model=Enrollment)
async def enroll(input: EnrollmentCreate, user=Depends(get_current_user)):
    # all verified users (email) can enroll
    if not user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email verification required")
    existing = await db.enrollments.find_one({"user_id": user["id"], "course_id": input.course_id})
    if existing:
        return Enrollment(**existing)
    enr = Enrollment(user_id=user["id"], course_id=input.course_id)
    await db.enrollments.insert_one(prepare_for_mongo(enr.model_dump()))
    return enr


@api_router.post("/enrollments/progress")
async def update_progress(p: ProgressUpdate, user=Depends(get_current_user)):
    enr = await db.enrollments.find_one({"user_id": user["id"], "course_id": p.course_id})
    if not enr:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    completed: List[str] = list(enr.get("completed_lessons", []))
    if p.completed and p.lesson_id not in completed:
        completed.append(p.lesson_id)
    if not p.completed and p.lesson_id in completed:
        completed.remove(p.lesson_id)

    total = await db.lessons.count_documents({"course_id": p.course_id, "published": True})
    pct = int(round((len(completed) / total) * 100)) if total > 0 else 0

    await db.enrollments.update_one(
        {"id": enr["id"]},
        {"$set": {"completed_lessons": completed, "progress_percent": pct, "updated_at": now_iso()}},
    )
    return {"progress_percent": pct, "completed_lessons": completed}


@api_router.get("/enrollments/me")
async def my_enrollments(user=Depends(get_current_user)):
    docs = await db.enrollments.find({"user_id": user["id"]}).sort("updated_at", -1).to_list(length=100)
    # attach course titles
    out = []
    for e in docs:
        course = await db.courses.find_one({"id": e["course_id"]})
        e["course_title"] = course["title"] if course else "Unknown"
        out.append(e)
    return out


# ---------------------- Podcast (Podigee) ----------------------
@api_router.post("/podcasts/seed")
async def seed_podcasts():
    if await db.podcasts.count_documents({}) > 0:
        return {"created": 0}
    eps = [
        PodcastEpisode(title="Interim Leadership — Episode 1", description="Kickoff with a DAX client on rapid transformation.", podigee_iframe_url="https://example.podigee.io/1-episode/embed"),
        PodcastEpisode(title="Turnarounds in 90 Days", description="High-profile CFO on cash discipline.", podigee_iframe_url="https://example.podigee.io/2-episode/embed"),
    ]
    await db.podcasts.insert_many([prepare_for_mongo(e.model_dump()) for e in eps])
    return {"created": len(eps)}


@api_router.get("/podcasts", response_model=List[PodcastEpisode])
async def list_podcasts(user=Depends(get_current_user)):
    docs = await db.podcasts.find({}).sort("created_at", -1).to_list(length=50)
    return [PodcastEpisode(**d) for d in docs]


class PodcastCreateInput(BaseModel):
    title: str
    description: Optional[str] = None
    podigee_iframe_url: str
    publish_date: Optional[str] = None


@api_router.post("/podcasts", response_model=PodcastEpisode)
async def create_podcast(ep: PodcastCreateInput, user=Depends(get_current_user)):
    # Allow only managers to add episodes
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager role required to add episodes")
    payload = PodcastEpisode(
        title=ep.title,
        description=ep.description,
        podigee_iframe_url=ep.podigee_iframe_url,
        publish_date=ep.publish_date or datetime.now(timezone.utc).date().isoformat(),
    )
    await db.podcasts.insert_one(prepare_for_mongo(payload.model_dump()))
    return payload


# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await ensure_indexes()
    await seed_admin()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()