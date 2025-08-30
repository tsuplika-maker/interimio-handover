from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, date, time, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Interimio API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ---------------------- Helpers ----------------------

BASE_SUBSCRIPTION_EUR = 299


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_for_mongo(data: Dict) -> Dict:
    # Convert date/time objects to ISO strings for MongoDB
    d = dict(data)
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.astimezone(timezone.utc).isoformat()
        elif isinstance(v, date):
            d[k] = v.isoformat()
        elif isinstance(v, time):
            d[k] = v.strftime('%H:%M:%S')
    return d


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
    percent_off: Optional[int] = None  # 0-100
    amount_off_eur: Optional[int] = None  # fixed amount in EUR
    is_active: bool = True
    assigned_to: Optional[str] = None  # e.g., group/shareholder name
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


# ---------------------- Routes ----------------------

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


# Managers
@api_router.post("/managers", response_model=Manager)
async def create_manager(manager: ManagerCreate):
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
    if existing &gt; 0:
        return {"created": 0, "message": "Managers already exist"}

    samples = [
        {
            "name": "Anna Richter",
            "title": "Interim CFO",
            "location": "Berlin, DE",
            "daily_rate_eur": 1200,
            "bio": "Finance leader with 15+ years in turnaround, FP&amp;A, and M&amp;A integration.",
            "skills": ["Turnaround", "FP&amp;A", "M&amp;A"],
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


# Leads &amp; fee
@api_router.post("/leads", response_model=Lead)
async def create_lead(lead: LeadCreate):
    # Basic existence check
    manager = await db.managers.find_one({"id": lead.manager_id})
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found")

    fee = int(round(lead.daily_rate_eur * lead.days * 0.20))
    l = Lead(**lead.model_dump(), fee_eur=fee)
    await db.leads.insert_one(prepare_for_mongo(l.model_dump()))
    return l


# Discount codes for manager subscription
@api_router.post("/discount-codes", response_model=DiscountCode)
async def create_discount_code(dc: DiscountCodeCreate):
    # Ensure uniqueness by code
    existing = await db.discount_codes.find_one({"code": dc.code})
    if existing:
        raise HTTPException(status_code=400, detail="Code already exists")

    if dc.percent_off is None and dc.amount_off_eur is None:
        raise HTTPException(status_code=400, detail="Provide percent_off or amount_off_eur")
    if dc.percent_off is not None and (dc.percent_off &lt; 0 or dc.percent_off &gt; 100):
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


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()