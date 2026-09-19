"""Interimio backend tests - Messaging (conversations, messages, redaction, release)"""
import os
import uuid
import asyncio
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    fe = Path(__file__).parent.parent.parent / "frontend" / ".env"
    for line in fe.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@interimio.com"
ADMIN_PASSWORD = "Interimio-Admin-3fb01e39"
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')


def _get_otp(user_id):
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        for _ in range(8):
            otp = await db.otps.find_one({"user_id": user_id, "used": False}, sort=[("created_at", -1)])
            if otp:
                client.close()
                return otp["code"]
            await asyncio.sleep(0.3)
        client.close()
        return None
    return asyncio.run(_run())


def _register_verify_login(role):
    email = f"TEST_msg_{role}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "TestPass123!", "role": role})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    code = _get_otp(uid)
    assert code, "OTP missing"
    v = requests.post(f"{API}/auth/verify-otp", json={"user_id": uid, "method": "email", "code": code})
    assert v.status_code == 200, v.text
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass123!"})
    assert l.status_code == 200
    return {"email": email, "user_id": uid, "token": l.json()["access_token"],
            "h": {"Authorization": f"Bearer {l.json()['access_token']}"}}


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def manager():
    m = _register_verify_login("manager")
    # create profile
    payload = {
        "name": "TEST Msg Mgr", "title": "Interim CFO", "location": "Berlin",
        "daily_rate_eur": 900, "skills": ["Finance"], "industries": ["SaaS"],
        "languages": ["English"], "years_experience": 8, "highlights": ["h1"], "about": "about"
    }
    r = requests.post(f"{API}/managers", headers=m["h"], json=payload)
    assert r.status_code == 200, r.text
    m["manager_id"] = r.json()["id"]
    return m


@pytest.fixture(scope="module")
def client_user():
    return _register_verify_login("client")


@pytest.fixture(scope="module")
def other_client():
    return _register_verify_login("client")


@pytest.fixture(scope="module")
def unverified_client():
    email = f"TEST_msg_unv_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "TestPass123!", "role": "client"})
    assert r.status_code == 200
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass123!"})
    assert l.status_code == 200
    return {"email": email, "token": l.json()["access_token"],
            "h": {"Authorization": f"Bearer {l.json()['access_token']}"}}


@pytest.fixture(scope="module")
def lead_conv(client_user, manager):
    """Create a lead which spawns a conversation with contact details in body."""
    body = "Please email me at foo.bar@example.com or +49 30 12345678 or visit https://acme.example.com"
    payload = {
        "manager_id": manager["manager_id"], "company_name": "TEST MsgCo",
        "contact_name": "Contact Person", "email": client_user["email"],
        "days": 5, "daily_rate_eur": 900, "message": body,
    }
    r = requests.post(f"{API}/leads", headers=client_user["h"], json=payload)
    assert r.status_code == 200, r.text
    lead = r.json()
    assert lead.get("conversation_id"), "Lead should include conversation_id"
    return {"lead": lead, "conv_id": lead["conversation_id"], "original_body": body}


# ------------- Lead conversation creation & participants -------------
class TestLeadConversation:
    def test_lead_returns_conversation_id(self, lead_conv):
        assert isinstance(lead_conv["conv_id"], str)

    def test_conversation_listed_for_client(self, client_user, lead_conv):
        r = requests.get(f"{API}/conversations", headers=client_user["h"])
        assert r.status_code == 200
        convs = r.json()
        c = next((c for c in convs if c["id"] == lead_conv["conv_id"]), None)
        assert c is not None
        assert c["type"] == "lead"
        assert "participants" in c and len(c["participants"]) >= 2
        assert "title" in c and "last_message_preview" in c

    def test_conversation_listed_for_manager(self, manager, lead_conv):
        r = requests.get(f"{API}/conversations", headers=manager["h"])
        assert r.status_code == 200
        assert any(c["id"] == lead_conv["conv_id"] for c in r.json())

    def test_conversation_listed_for_admin(self, admin_h, lead_conv):
        r = requests.get(f"{API}/conversations", headers=admin_h)
        assert r.status_code == 200
        assert any(c["id"] == lead_conv["conv_id"] for c in r.json())


# ------------- Redaction -------------
class TestRedaction:
    def test_client_sees_redacted_first_message(self, client_user, lead_conv):
        r = requests.get(f"{API}/conversations/{lead_conv['conv_id']}/messages", headers=client_user["h"])
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 1
        first = msgs[0]
        assert first["redacted"] is True
        assert "foo.bar@example.com" not in first["body"]
        assert "+49" not in first["body"] or "[hidden until release]" in first["body"]

    def test_manager_sees_redacted(self, manager, lead_conv):
        r = requests.get(f"{API}/conversations/{lead_conv['conv_id']}/messages", headers=manager["h"])
        assert r.status_code == 200
        first = r.json()[0]
        assert first["redacted"] is True
        assert "foo.bar@example.com" not in first["body"]

    def test_admin_sees_original(self, admin_h, lead_conv):
        r = requests.get(f"{API}/conversations/{lead_conv['conv_id']}/messages", headers=admin_h)
        assert r.status_code == 200
        first = r.json()[0]
        assert first["redacted"] is False
        assert "foo.bar@example.com" in first["body"]

    def test_release_forbidden_non_admin(self, client_user, lead_conv):
        r = requests.patch(f"{API}/conversations/{lead_conv['conv_id']}/release",
                           headers=client_user["h"], json={"released": True})
        assert r.status_code == 403

    def test_release_by_admin_and_client_sees_original(self, admin_h, client_user, lead_conv):
        r = requests.patch(f"{API}/conversations/{lead_conv['conv_id']}/release",
                           headers=admin_h, json={"released": True})
        assert r.status_code == 200
        assert r.json()["contact_released"] is True
        r2 = requests.get(f"{API}/conversations/{lead_conv['conv_id']}/messages", headers=client_user["h"])
        assert r2.status_code == 200
        first = r2.json()[0]
        assert first["redacted"] is False
        assert "foo.bar@example.com" in first["body"]


# ------------- Post message, unread, access control -------------
class TestPostMessageAndUnread:
    def test_post_and_unread_flow(self, client_user, manager, admin_h, lead_conv):
        conv_id = lead_conv["conv_id"]
        # Manager reads to reset unread (from lead creation)
        requests.get(f"{API}/conversations/{conv_id}/messages", headers=manager["h"])
        # Client posts
        r = requests.post(f"{API}/conversations/{conv_id}/messages",
                          headers=client_user["h"], json={"body": "Hello there"})
        assert r.status_code == 200, r.text
        assert r.json()["body"] == "Hello there"
        # Manager should have unread >= 1
        r_list = requests.get(f"{API}/conversations", headers=manager["h"])
        conv = next(c for c in r_list.json() if c["id"] == conv_id)
        assert conv["unread"] >= 1
        # Admin unread aggregation
        au = requests.get(f"{API}/conversations/unread-count", headers=admin_h)
        assert au.status_code == 200
        assert au.json()["unread"] >= 1
        # Manager reads messages -> unread resets
        rr = requests.get(f"{API}/conversations/{conv_id}/messages", headers=manager["h"])
        assert rr.status_code == 200
        uc = requests.get(f"{API}/conversations/unread-count", headers=manager["h"])
        assert uc.status_code == 200
        assert uc.json()["unread"] == 0

    def test_non_participant_gets_404(self, other_client, lead_conv):
        r = requests.get(f"{API}/conversations/{lead_conv['conv_id']}/messages", headers=other_client["h"])
        assert r.status_code == 404
        r2 = requests.post(f"{API}/conversations/{lead_conv['conv_id']}/messages",
                           headers=other_client["h"], json={"body": "hi"})
        assert r2.status_code == 404

    def test_unverified_user_403(self, unverified_client, lead_conv):
        # unverified user is not a participant; endpoint checks access first -> 404 expected.
        # Ensure we get a conversation the user IS a participant of: create via support? Support requires verified? Let's just
        # try posting to lead conv: should be 404 (not participant) which is acceptable, but spec wants 403 for unverified.
        # Try creating support for unverified -> can create. Then post to it while unverified.
        s = requests.post(f"{API}/conversations/support", headers=unverified_client["h"])
        assert s.status_code == 200
        cid = s.json()["id"]
        r = requests.post(f"{API}/conversations/{cid}/messages",
                          headers=unverified_client["h"], json={"body": "hi"})
        assert r.status_code == 403

    def test_empty_body_422(self, client_user, lead_conv):
        r = requests.post(f"{API}/conversations/{lead_conv['conv_id']}/messages",
                          headers=client_user["h"], json={"body": ""})
        assert r.status_code == 422


# ------------- Support conversation -------------
class TestSupportConversation:
    def test_support_idempotent(self, client_user):
        r1 = requests.post(f"{API}/conversations/support", headers=client_user["h"])
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/conversations/support", headers=client_user["h"])
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]
        assert r1.json()["type"] == "support"
        assert client_user["email"] in r1.json()["title"]

    def test_support_never_redacted(self, client_user, admin_h):
        r = requests.post(f"{API}/conversations/support", headers=client_user["h"])
        cid = r.json()["id"]
        body = "Contact me at test@example.com or +49 111 2222"
        p = requests.post(f"{API}/conversations/{cid}/messages", headers=client_user["h"], json={"body": body})
        assert p.status_code == 200
        m = requests.get(f"{API}/conversations/{cid}/messages", headers=client_user["h"])
        assert m.status_code == 200
        # find our message
        our = [x for x in m.json() if x["body"] == body]
        assert our and our[0]["redacted"] is False

    def test_admin_cannot_create_support(self, admin_h):
        r = requests.post(f"{API}/conversations/support", headers=admin_h)
        assert r.status_code == 400
