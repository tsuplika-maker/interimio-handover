"""Interimio backend tests - admin, managers, leads, pro-interest, discount codes"""
import os
import pytest
import requests
import uuid
import time
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # read from frontend .env
    fe = Path(__file__).parent.parent.parent / "frontend" / ".env"
    for line in fe.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip('/')

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@interimio.com"
ADMIN_PASSWORD = "Interimio-Admin-3fb01e39"

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')


def get_otp_from_mongo(user_id):
    async def _get():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        for _ in range(5):
            otp = await db.otps.find_one({"user_id": user_id, "used": False}, sort=[("created_at", -1)])
            if otp:
                client.close()
                return otp["code"]
            await asyncio.sleep(0.3)
        client.close()
        return None
    return asyncio.run(_get())


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _register_and_verify(role):
    email = f"TEST_{role}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "TestPass123!", "role": role})
    assert r.status_code == 200, r.text
    user_id = r.json()["user_id"]
    code = get_otp_from_mongo(user_id)
    assert code, "OTP not found"
    v = requests.post(f"{API}/auth/verify-otp", json={"user_id": user_id, "method": "email", "code": code})
    assert v.status_code == 200, v.text
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass123!"})
    assert l.status_code == 200
    return {"email": email, "user_id": user_id, "token": l.json()["access_token"]}


@pytest.fixture(scope="session")
def manager_user():
    return _register_and_verify("manager")


@pytest.fixture(scope="session")
def client_user():
    return _register_and_verify("client")


# --------- Admin auth & me ---------
class TestAdminAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_admin_me(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_admin_endpoints_require_auth(self):
        for path in ["/admin/stats", "/admin/leads", "/admin/discount-codes"]:
            r = requests.get(f"{API}{path}")
            assert r.status_code == 401, f"{path} got {r.status_code}"

    def test_admin_endpoints_forbid_non_admin(self, client_user):
        h = {"Authorization": f"Bearer {client_user['token']}"}
        r = requests.get(f"{API}/admin/stats", headers=h)
        assert r.status_code == 403


# --------- Admin stats/leads/csv ---------
class TestAdminLeadsAndStats:
    def test_stats(self, admin_headers):
        r = requests.get(f"{API}/admin/stats", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for k in ["users_total", "clients", "managers_users", "manager_profiles", "leads_total", "leads_new", "fees_total_eur", "pro_interest", "discount_codes_active"]:
            assert k in data

    def test_leads_list_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/leads", headers=admin_headers, params={"status": "new"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        r2 = requests.get(f"{API}/admin/leads", headers=admin_headers, params={"q": "zzz_no_match_zzz"})
        assert r2.status_code == 200
        assert r2.json() == []

    def test_export_csv(self, admin_headers):
        r = requests.get(f"{API}/admin/leads/export", headers=admin_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert r.text.splitlines()[0].startswith("created_at,status,manager")


# --------- Discount codes ---------
class TestDiscountCodes:
    def test_list_codes_has_uses(self, admin_headers):
        r = requests.get(f"{API}/admin/discount-codes", headers=admin_headers)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) >= 3
        assert all("uses" in d for d in docs)

    def test_create_code_admin_only(self, client_user, admin_headers):
        h = {"Authorization": f"Bearer {client_user['token']}"}
        code_name = f"TESTCODE{uuid.uuid4().hex[:6].upper()}"
        r = requests.post(f"{API}/discount-codes", headers=h, json={"code": code_name, "percent_off": 10})
        assert r.status_code == 403

        # admin succeeds
        r = requests.post(f"{API}/discount-codes", headers=admin_headers, json={"code": code_name.lower(), "percent_off": 15})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["code"] == code_name  # uppercased
        code_id = body["id"]

        # duplicate
        r2 = requests.post(f"{API}/discount-codes", headers=admin_headers, json={"code": code_name, "percent_off": 15})
        assert r2.status_code == 400

        # patch active
        r3 = requests.patch(f"{API}/admin/discount-codes/{code_id}", headers=admin_headers, json={"is_active": False})
        assert r3.status_code == 200
        assert r3.json()["is_active"] is False

        # validate public still works
        rv = requests.get(f"{API}/discount-codes/validate", params={"code": "SHARE10"})
        assert rv.status_code == 200
        assert rv.json()["valid"] is True

        # delete
        rd = requests.delete(f"{API}/admin/discount-codes/{code_id}", headers=admin_headers)
        assert rd.status_code == 200
        assert rd.json()["deleted"] is True


# --------- Managers ---------
class TestManagers:
    def test_seeded_manager_detail(self):
        r = requests.get(f"{API}/managers/85a9d2b0-4bdd-4971-9e9e-66539ded01a1")
        # Might not exist; try list first
        if r.status_code == 404:
            lst = requests.get(f"{API}/managers").json()
            assert len(lst) > 0
            r = requests.get(f"{API}/managers/{lst[0]['id']}")
        assert r.status_code == 200
        data = r.json()
        for k in ["industries", "languages", "years_experience", "highlights", "about"]:
            assert k in data

    def test_manager_404(self):
        r = requests.get(f"{API}/managers/does-not-exist-xxx")
        assert r.status_code == 404

    def test_manager_upsert(self, manager_user):
        h = {"Authorization": f"Bearer {manager_user['token']}"}
        payload = {
            "name": "TEST Manager", "title": "Interim CFO", "location": "Berlin",
            "daily_rate_eur": 1000, "skills": ["Finance"], "industries": ["SaaS"],
            "languages": ["English"], "years_experience": 10, "highlights": ["h1"], "about": "about"
        }
        r1 = requests.post(f"{API}/managers", headers=h, json=payload)
        assert r1.status_code == 200, r1.text
        id1 = r1.json()["id"]
        # second call updates
        payload["name"] = "TEST Manager Updated"
        r2 = requests.post(f"{API}/managers", headers=h, json=payload)
        assert r2.status_code == 200
        assert r2.json()["id"] == id1
        assert r2.json()["name"] == "TEST Manager Updated"
        # GET /me
        rm = requests.get(f"{API}/managers/me", headers=h)
        assert rm.status_code == 200
        assert rm.json()["id"] == id1


# --------- Pro interest ---------
class TestProInterest:
    def test_valid_code_increments_uses(self, manager_user, admin_headers):
        # Get initial uses for SHARE10
        docs = requests.get(f"{API}/admin/discount-codes", headers=admin_headers).json()
        share10 = next(d for d in docs if d["code"] == "SHARE10")
        before = share10["uses"]

        h = {"Authorization": f"Bearer {manager_user['token']}"}
        r = requests.post(f"{API}/pro/interest", headers=h, json={"discount_code": "share10"})
        assert r.status_code == 200
        assert r.json()["code_valid"] is True

        docs2 = requests.get(f"{API}/admin/discount-codes", headers=admin_headers).json()
        share10_after = next(d for d in docs2 if d["code"] == "SHARE10")
        assert share10_after["uses"] >= before + 1

    def test_invalid_code(self, manager_user):
        h = {"Authorization": f"Bearer {manager_user['token']}"}
        r = requests.post(f"{API}/pro/interest", headers=h, json={"discount_code": "NOTREAL"})
        assert r.status_code == 200
        assert r.json()["code_valid"] is False

    def test_client_forbidden(self, client_user):
        h = {"Authorization": f"Bearer {client_user['token']}"}
        r = requests.post(f"{API}/pro/interest", headers=h, json={})
        assert r.status_code == 403


# --------- Leads ---------
class TestLeads:
    def test_client_create_lead(self, client_user, admin_headers):
        managers = requests.get(f"{API}/managers").json()
        mgr = managers[0]
        h = {"Authorization": f"Bearer {client_user['token']}"}
        payload = {
            "manager_id": mgr["id"], "company_name": "TEST Co", "contact_name": "Tester",
            "email": client_user["email"], "days": 10, "daily_rate_eur": 1000,
            "message": "hello"
        }
        r = requests.post(f"{API}/leads", headers=h, json=payload)
        assert r.status_code == 200, r.text
        lead = r.json()
        assert lead["status"] == "new"
        assert lead["manager_name"] == mgr["name"]
        assert lead["client_user_id"] == client_user["user_id"]
        assert lead["fee_eur"] == int(round(1000 * 10 * 0.2))
        lead_id = lead["id"]

        # appears in admin leads
        leads = requests.get(f"{API}/admin/leads", headers=admin_headers).json()
        assert any(l["id"] == lead_id for l in leads)

        # patch status
        r2 = requests.patch(f"{API}/admin/leads/{lead_id}", headers=admin_headers, json={"status": "contacted"})
        assert r2.status_code == 200
        # invalid status
        r3 = requests.patch(f"{API}/admin/leads/{lead_id}", headers=admin_headers, json={"status": "bogus"})
        assert r3.status_code == 400
