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


