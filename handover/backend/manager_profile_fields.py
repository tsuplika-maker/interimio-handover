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


