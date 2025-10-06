from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request
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

# Optional SendGrid import (email sending)
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
    HAS_SENDGRID = True
except Exception:  # pragma: no cover
    HAS_SENDGRID = False

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
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "noreply@example.com")
EMAIL_DEV_MODE = "true" if not SENDGRID_API_KEY else os.environ.get("EMAIL_DEV_MODE", "false")

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
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(p: str, hashed: str) -> bool:
    return pwd_context.verify(p, hashed)


def create_access_token(sub: str, extra: Dict) -> str:
    payload = {
        "sub": sub,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_MIN),
        **extra,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def send_email_code(to_email: str, code: str) -> bool:
    """Send OTP code via SendGrid if configured. Returns True if sent."""
    if not SENDGRID_API_KEY or not HAS_SENDGRID:
        return False
    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        message = Mail(
            from_email=SENDER_EMAIL,
            to_emails=to_email,
            subject="Your Interimio verification code",
            html_content=f"""
                <div style='font-family: Montserrat, Arial; line-height:1.6'>
                  <h2 style='margin:0 0 8px'>Verify your email</h2>
                  <p>Your one-time verification code is:</p>
                  <div style='font-size:28px;font-weight:700;background:#0b6bcb;color:#fff;padding:12px 16px;border-radius:8px;display:inline-block;letter-spacing:3px'>{code}</div>
                  <p style='margin-top:12px'>This code expires in 10 minutes. If you didn’t request it, you can ignore this message.</p>
                </div>
            """,
        )
        resp = sg.send(message)
        logger.info(f"SendGrid sent status={resp.status_code}")
        return 200 <= getattr(resp, "status_code", 500) < 300
    except Exception as e:  # pragma: no cover
        logger.error(f"SendGrid send failed: {e}")
        return False


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


class Manager(ManagerCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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


# Podcast
class PodcastEpisodeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    spotify_url: str
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
    # Only verified managers can create a profile (email-first)
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager account required")
    if not user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email verification required")
    m = Manager(**manager.model_dump())
    await db.managers.insert_one(prepare_for_mongo(m.model_dump()))
    return m


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
async def seed_managers():
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

    created = 0
    for s in samples:
        m = Manager(**s)
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
    l = Lead(**lead.model_dump(), fee_eur=fee)
    await db.leads.insert_one(prepare_for_mongo(l.model_dump()))
    return l


# ---------------------- Discount codes ----------------------
@api_router.post("/discount-codes", response_model=DiscountCode)
async def create_discount_code(dc: DiscountCodeCreate):
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
async def seed_discount_codes():
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
    sent = send_email_code(input.email, code)
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
    sent = send_email_code(user['email'], code)
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
        exp = datetime.utcnow() - timedelta(seconds=1)
    if exp < datetime.utcnow():
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


# ---------------------- Podcast ----------------------
@api_router.post("/podcasts/seed")
async def seed_podcasts():
    if await db.podcasts.count_documents({}) > 0:
        return {"created": 0}
    eps = [
        PodcastEpisode(title="Interim Leadership — Episode 1", description="Kickoff with a DAX client on rapid transformation.", spotify_url="https://open.spotify.com/embed/episode/6rqhFgbbKwnb9MLmUQDhG6"),
        PodcastEpisode(title="Turnarounds in 90 Days", description="High-profile CFO on cash discipline.", spotify_url="https://open.spotify.com/embed/episode/2cYVEtLFK9pFQf3VqM0J8G"),
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
    spotify_url: str
    publish_date: Optional[str] = None


@api_router.post("/podcasts", response_model=PodcastEpisode)
async def create_podcast(ep: PodcastCreateInput, user=Depends(get_current_user)):
    # Allow only managers to add episodes for now
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager role required to add episodes")
    payload = PodcastEpisode(**{**ep.model_dump(), **({"publish_date": ep.publish_date} if ep.publish_date else {})})
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()