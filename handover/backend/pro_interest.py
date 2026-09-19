class ProInterestInput(BaseModel):
    discount_code: Optional[str] = None



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


