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
    if EMAIL_DEV_MODE == "true":
        logger.info(f"[DEV OTP] Email code for {input.email}: {code}")
    # If SENDGRID configured, send mail (omitted for MVP)
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
    if EMAIL_DEV_MODE == "true":
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


# Dev-only helper to fetch last OTP (if email dev mode)
@api_router.get("/auth/dev/last-otp")
async def dev_last_otp(user_id: str):
    if EMAIL_DEV_MODE != "true":
        raise HTTPException(status_code=404, detail="Not available")
    doc = await db.otps.find({"user_id": user_id, "method": "email"}).sort("created_at", -1).to_list(1)
    if not doc:
        return {"code": None}
    return {"code": doc[0].get("code")}


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