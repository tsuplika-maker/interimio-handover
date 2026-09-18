"""Create client + manager (owning profile) + a lead so we have UI seed data."""
import os, sys, uuid, asyncio, json, requests
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path("/app/backend/.env"))
BASE = None
for line in Path("/app/frontend/.env").read_text().splitlines():
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE = line.split("=",1)[1].strip().rstrip("/")
API = f"{BASE}/api"
MONGO = os.environ["MONGO_URL"]; DBN = os.environ["DB_NAME"]

async def get_otp(uid):
    c = AsyncIOMotorClient(MONGO); db = c[DBN]
    for _ in range(15):
        o = await db.otps.find_one({"user_id": uid, "used": False}, sort=[("created_at",-1)])
        if o:
            c.close(); return o["code"]
        await asyncio.sleep(0.3)
    c.close(); return None

def register(role, pwd="TestPass123!"):
    email = f"TEST_uiMsg_{role}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": pwd, "role": role}); r.raise_for_status()
    uid = r.json()["user_id"]
    code = asyncio.run(get_otp(uid)); assert code
    v = requests.post(f"{API}/auth/verify-otp", json={"user_id": uid, "method":"email", "code": code}); v.raise_for_status()
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}); l.raise_for_status()
    return {"email": email, "password": pwd, "user_id": uid, "token": l.json()["access_token"]}

def main():
    manager = register("manager")
    client = register("client")
    # manager profile
    h = {"Authorization": f"Bearer {manager['token']}"}
    payload = {"name": f"TEST UI Msg Mgr {uuid.uuid4().hex[:4]}", "title": "Interim CFO", "location": "Berlin",
               "daily_rate_eur": 950, "skills": ["Finance"], "industries": ["SaaS"], "languages": ["English"],
               "years_experience": 10, "highlights": ["h1"], "about": "about"}
    r = requests.post(f"{API}/managers", headers=h, json=payload); r.raise_for_status()
    manager["manager_id"] = r.json()["id"]
    manager["manager_name"] = r.json()["name"]
    out = {"manager": manager, "client": client, "base": BASE}
    print(json.dumps(out))
    Path("/app/tests/msg_users.json").write_text(json.dumps(out))

if __name__ == "__main__":
    main()
