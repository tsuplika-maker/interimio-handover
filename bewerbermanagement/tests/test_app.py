import os
import re
import sqlite3
import tempfile

import pytest

os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(os.environ["DATA_DIR"], "test.db")
os.environ["SUPERADMIN_EMAIL"] = "boss@hireflow.test"

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402

PDF = b"%PDF-1.4 test"


def csrf_of(client, url):
    html = client.get(url).text
    return re.search(r'name="csrf" value="([^"]+)"', html).group(1)


def register(client, company, email):
    token = csrf_of(client, "/registrieren")
    r = client.post("/registrieren", data={"company": company, "name": "Anna Admin", "email": email,
                                           "password": "sehrgeheim123", "csrf": token}, follow_redirects=False)
    assert r.status_code == 303, r.text
    return csrf_of(client, "/app")  # Session (inkl. CSRF-Token) wird beim Login erneuert


def create_published_job(client, token, title="Backend Entwickler (m/w/d)"):
    r = client.post("/app/stellen/neu", data={"title": title, "location": "Berlin", "csrf": token},
                    follow_redirects=False)
    job_id = int(r.headers["location"].rsplit("/", 1)[1])
    r = client.post(f"/app/stellen/{job_id}/status", data={"status": "published", "csrf": token},
                    follow_redirects=False)
    assert r.status_code == 303
    return job_id


def org_slug(email):
    with db.connect() as conn:
        return conn.execute("SELECT o.slug FROM organizations o JOIN users u ON u.org_id=o.id WHERE u.email=?",
                            (email,)).fetchone()[0]


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def apply(client, slug, job_id, email="max@example.com"):
    token = csrf_of(client, f"/karriere/{slug}/stellen/{job_id}")
    return client.post(
        f"/karriere/{slug}/stellen/{job_id}/bewerben",
        data={"first_name": "Max", "last_name": "Muster", "email": email, "consent": "1", "csrf": token},
        files=[("files", ("lebenslauf.pdf", PDF, "application/pdf"))],
        follow_redirects=False,
    )


def test_full_flow(client):
    token = register(client, "Müller & Söhne GmbH", "anna@mueller.test")
    slug = org_slug("anna@mueller.test")
    assert slug == "mueller-soehne-gmbh"
    job_id = create_published_job(client, token)

    public = TestClient(app)
    page = public.get(f"/karriere/{slug}")
    assert "Backend Entwickler" in page.text
    detail = public.get(f"/karriere/{slug}/stellen/{job_id}")
    assert '"@type": "JobPosting"' in detail.text
    r = apply(public, slug, job_id)
    assert r.status_code == 303 and r.headers["location"].endswith("/danke")

    feed = public.get(f"/api/public/{slug}/jobs").json()
    assert feed["jobs"][0]["title"].startswith("Backend")
    assert "fetch(" in public.get(f"/karriere/{slug}/widget.js").text

    with db.connect() as conn:
        a = conn.execute("SELECT * FROM applications").fetchone()
        assert conn.execute("SELECT COUNT(*) FROM documents WHERE application_id=?", (a["id"],)).fetchone()[0] == 1
        mail = conn.execute("SELECT subject FROM emails_sent WHERE application_id=?", (a["id"],)).fetchone()
        assert "Backend Entwickler" in mail["subject"]
        rejected = conn.execute("SELECT id FROM stages WHERE org_id=? AND kind='rejected'", (a["org_id"],)).fetchone()[0]

    board = client.get(f"/app/stellen/{job_id}")
    assert "Max Muster" in board.text
    r = client.post(f"/app/bewerber/{a['id']}/phase", json={"stage_id": rejected, "send_mail": True},
                    headers={"X-CSRF-Token": token, "Accept": "application/json"})
    assert r.json() == {"ok": True}
    client.post(f"/app/bewerber/{a['id']}/notiz", data={"body": "Starkes Profil", "csrf": token})
    client.post(f"/app/bewerber/{a['id']}/bewertung", data={"rating": "4", "csrf": token})
    detail = client.get(f"/app/bewerber/{a['id']}")
    assert "Starkes Profil" in detail.text and "Eingegangen → Abgelehnt" in detail.text
    with db.connect() as conn:
        row = conn.execute("SELECT rating, closed_at FROM applications WHERE id=?", (a["id"],)).fetchone()
        assert row["rating"] == 4 and row["closed_at"]
        assert conn.execute("SELECT COUNT(*) FROM emails_sent WHERE application_id=?", (a["id"],)).fetchone()[0] == 2

    doc_id = client.get(f"/app/bewerber/{a['id']}/export").json()
    assert doc_id["bewerbung"]["email"] == "max@example.com"
    assert client.get("/app").status_code == 200


def test_tenant_isolation(client):
    token_a = register(client, "Firma A", "a@a.test")
    job_a = create_published_job(client, token_a)
    apply(TestClient(app), org_slug("a@a.test"), job_a, email="iso@example.com")
    with db.connect() as conn:
        app_id = conn.execute("SELECT id FROM applications WHERE email='iso@example.com'").fetchone()[0]
        doc_id = conn.execute("SELECT id FROM documents WHERE application_id=?", (app_id,)).fetchone()[0]

    other = TestClient(app)
    token_b = register(other, "Firma B", "b@b.test")
    assert other.get(f"/app/bewerber/{app_id}").status_code == 404
    assert other.get(f"/app/stellen/{job_a}").status_code == 404
    assert other.get(f"/app/dokumente/{doc_id}").status_code == 404
    r = other.post(f"/app/bewerber/{app_id}/loeschen", data={"csrf": token_b})
    assert r.status_code == 404
    assert client.get(f"/app/dokumente/{doc_id}").content == PDF


def test_auth_and_csrf(client):
    r = client.get("/app", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/login")
    token = register(client, "CSRF GmbH", "c@c.test")
    r = client.post("/app/stellen/neu", data={"title": "X", "csrf": "falsch"})
    assert r.status_code == 403
    client.post("/logout", data={"csrf": token})
    token = csrf_of(client, "/login")
    bad = client.post("/login", data={"email": "c@c.test", "password": "falsch", "csrf": token})
    assert bad.status_code == 400
    ok = client.post("/login", data={"email": "c@c.test", "password": "sehrgeheim123", "csrf": token},
                     follow_redirects=False)
    assert ok.headers["location"] == "/app"


def test_application_validation(client):
    token = register(client, "Valid GmbH", "v@v.test")
    job_id = create_published_job(client, token)
    slug = org_slug("v@v.test")
    pub = TestClient(app)
    t = csrf_of(pub, f"/karriere/{slug}/stellen/{job_id}")
    r = pub.post(f"/karriere/{slug}/stellen/{job_id}/bewerben",
                 data={"first_name": "A", "last_name": "B", "email": "a@b.de", "csrf": t},
                 files=[("files", ("cv.pdf", PDF, "application/pdf"))])
    assert r.status_code == 400 and "Verarbeitung" in r.text
    r = pub.post(f"/karriere/{slug}/stellen/{job_id}/bewerben",
                 data={"first_name": "A", "last_name": "B", "email": "a@b.de", "consent": "1", "csrf": t},
                 files=[("files", ("virus.exe", b"MZ", "application/octet-stream"))])
    assert r.status_code == 400
    # Entwurf ist öffentlich nicht sichtbar
    r = client.post("/app/stellen/neu", data={"title": "Geheim", "csrf": token}, follow_redirects=False)
    draft = r.headers["location"].rsplit("/", 1)[1]
    assert pub.get(f"/karriere/{slug}/stellen/{draft}").status_code == 404


def test_plan_limits_and_roles(client):
    token = register(client, "Limit GmbH", "l@l.test")
    with db.connect() as conn:
        conn.execute("UPDATE organizations SET plan='starter' WHERE slug='limit-gmbh'")
    for i in range(3):
        create_published_job(client, token, f"Job {i}")
    create_published_job(client, token, "Job zu viel")
    with db.connect() as conn:
        org_id = conn.execute("SELECT id FROM organizations WHERE slug='limit-gmbh'").fetchone()[0]
        assert conn.execute("SELECT COUNT(*) FROM jobs WHERE org_id=? AND status='published'", (org_id,)).fetchone()[0] == 3

    client.post("/app/team", data={"name": "Fachbereich", "email": "f@l.test", "role": "viewer",
                                   "password": "fachbereich123", "csrf": token})
    viewer = TestClient(app)
    t = csrf_of(viewer, "/login")
    viewer.post("/login", data={"email": "f@l.test", "password": "fachbereich123", "csrf": t})
    t = csrf_of(viewer, "/app")
    assert viewer.post("/app/stellen/neu", data={"title": "Nope", "csrf": t}).status_code == 403
    assert viewer.get("/app/einstellungen").status_code == 403
    # Starter erlaubt nur 2 Nutzer
    client.post("/app/team", data={"name": "Dritter", "email": "d@l.test", "role": "recruiter",
                                   "password": "dritter12345", "csrf": token})
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM users WHERE org_id=?", (org_id,)).fetchone()[0] == 2


def test_trial_expiry_and_retention(client):
    token = register(client, "Alt GmbH", "alt@alt.test")
    job_id = create_published_job(client, token)
    slug = org_slug("alt@alt.test")
    apply(TestClient(app), slug, job_id, email="old@example.com")
    with db.connect() as conn:
        conn.execute("UPDATE organizations SET trial_ends_at='2000-01-01T00:00:00+00:00' WHERE slug=?", (slug,))
        conn.execute("UPDATE applications SET closed_at='2000-01-01T00:00:00+00:00' WHERE email='old@example.com'")
    r = client.get("/app", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/app/abo"
    assert client.get("/app/abo").status_code == 200
    assert TestClient(app).get(f"/karriere/{slug}/stellen/{job_id}").status_code == 404
    with db.connect() as conn:
        assert db.purge_expired(conn) >= 1
        assert conn.execute("SELECT COUNT(*) FROM applications WHERE email='old@example.com'").fetchone()[0] == 0


def test_superadmin(client):
    token = register(client, "Plattform", "boss@hireflow.test")
    assert "MRR" in client.get("/superadmin").text
    with db.connect() as conn:
        org_id = conn.execute("SELECT id FROM organizations WHERE slug='plattform'").fetchone()[0]
    client.post(f"/superadmin/{org_id}/plan", data={"plan": "business", "csrf": token})
    with db.connect() as conn:
        assert conn.execute("SELECT plan FROM organizations WHERE id=?", (org_id,)).fetchone()[0] == "business"
    normal = TestClient(app)
    register(normal, "Normalo", "n@n.test")
    assert normal.get("/superadmin").status_code == 403


def test_pages_render(client):
    assert client.get("/").status_code == 200
    token = register(client, "Render GmbH", "r@r.test")
    job_id = create_published_job(client, token)
    for url in ["/app", "/app/stellen", "/app/stellen/neu", f"/app/stellen/{job_id}/bearbeiten", "/app/bewerber",
                "/app/bewerber/neu", "/app/team", "/app/einstellungen", "/app/abo"]:
        assert client.get(url).status_code == 200, url
