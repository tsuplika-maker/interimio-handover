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


