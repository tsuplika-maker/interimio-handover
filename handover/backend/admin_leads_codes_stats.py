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


