"""HireFlow – mandantenfähiges Bewerbermanagement (ATS) für Unternehmen."""
import json
import os
import re
import secrets
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from . import db, mailer
from .security import (
    PLANS,
    ROLES,
    check_csrf,
    csrf_token,
    hash_password,
    require_role,
    verify_password,
)

APP_NAME = os.environ.get("APP_NAME", "HireFlow")
SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "").lower()
BASE_DIR = Path(__file__).resolve().parent
ALLOWED_EXT = {".pdf", ".doc", ".docx", ".odt", ".png", ".jpg", ".jpeg"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 5
TRIAL_DAYS = 14
STATUS_LABELS = {"draft": "Entwurf", "published": "Veröffentlicht", "closed": "Geschlossen"}
EMPLOYMENT_TYPES = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Praktikum", "Ausbildung", "Freelance"]
REMOTE_OPTIONS = ["Vor Ort", "Hybrid", "Remote"]


@asynccontextmanager
async def lifespan(_app):
    db.init_db()
    with db.connect() as conn:
        db.purge_expired(conn)
    yield


app = FastAPI(title=APP_NAME, lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SECRET_KEY", "dev-secret-bitte-in-produktion-aendern"),
    session_cookie="hf_session",
    same_site="lax",
    https_only=os.environ.get("COOKIE_SECURE", "0") == "1",
    max_age=60 * 60 * 12,
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")
templates.env.globals.update(
    APP_NAME=APP_NAME, ROLES=ROLES, PLANS=PLANS, STATUS_LABELS=STATUS_LABELS,
    EMPLOYMENT_TYPES=EMPLOYMENT_TYPES, REMOTE_OPTIONS=REMOTE_OPTIONS,
)


def _fmt_date(value: str | None, with_time: bool = False) -> str:
    if not value:
        return ""
    dt = datetime.fromisoformat(value)
    return dt.strftime("%d.%m.%Y %H:%M" if with_time else "%d.%m.%Y")


templates.env.filters["datum"] = _fmt_date


# --------------------------------------------------------------------------- Helfer

class LoginRequired(Exception):
    pass


@app.exception_handler(LoginRequired)
async def _login_redirect(request: Request, _exc):
    return RedirectResponse(f"/login?next={request.url.path}", status_code=303)


@app.exception_handler(HTTPException)
async def _http_error(request: Request, exc: HTTPException):
    if request.headers.get("accept", "").startswith("application/json") or request.url.path.startswith("/api/"):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    if exc.status_code == 402:
        flash(request, exc.detail, "error")
        return redirect("/app/abo")
    return templates.TemplateResponse(
        request, "error.html", {"status": exc.status_code, "detail": exc.detail, "csrf": csrf_token(request)},
        status_code=exc.status_code,
    )


def flash(request: Request, message: str, kind: str = "ok") -> None:
    request.session.setdefault("flash", []).append({"msg": message, "kind": kind})


def redirect(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=303)


def render(request: Request, name: str, ctx: dict | None = None, status_code: int = 200):
    ctx = dict(ctx or {})
    ctx.setdefault("user", getattr(request.state, "user", None))
    ctx.setdefault("org", getattr(request.state, "org", None))
    ctx["csrf"] = csrf_token(request)
    ctx["flashes"] = request.session.pop("flash", [])
    ctx["is_superadmin"] = bool(ctx["user"] and SUPERADMIN_EMAIL and ctx["user"]["email"] == SUPERADMIN_EMAIL)
    return templates.TemplateResponse(request, name, ctx, status_code=status_code)


def slugify(text: str) -> str:
    text = text.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:50] or "firma"


def trial_expired(org) -> bool:
    if org["plan"] != "trial" or not org["trial_ends_at"]:
        return False
    return datetime.fromisoformat(org["trial_ends_at"]) < datetime.now(timezone.utc)


def load_user(request: Request, conn, allow_expired: bool = False):
    uid = request.session.get("uid")
    if not uid:
        raise LoginRequired()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not user:
        request.session.clear()
        raise LoginRequired()
    org = conn.execute("SELECT * FROM organizations WHERE id = ?", (user["org_id"],)).fetchone()
    request.state.user, request.state.org = user, org
    if trial_expired(org) and not allow_expired:
        raise HTTPException(
            status_code=402,
            detail="Ihre Testphase ist abgelaufen. Bitte wählen Sie unter „Abo“ einen Tarif.",
        )
    return user, org


def get_application(conn, org_id: int, app_id: int):
    row = conn.execute(
        """SELECT a.*, j.title AS job_title, s.name AS stage_name, s.kind AS stage_kind
           FROM applications a JOIN jobs j ON j.id = a.job_id JOIN stages s ON s.id = a.stage_id
           WHERE a.org_id = ? AND a.id = ?""",
        (org_id, app_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bewerbung nicht gefunden.")
    return row


def get_job(conn, org_id: int, job_id: int):
    row = conn.execute("SELECT * FROM jobs WHERE org_id = ? AND id = ?", (org_id, job_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Stelle nicht gefunden.")
    return row


def stages_for(conn, org_id: int):
    return conn.execute("SELECT * FROM stages WHERE org_id = ? ORDER BY position", (org_id,)).fetchall()


def template_values(org, application, job_title: str) -> dict:
    return {
        "vorname": application["first_name"],
        "nachname": application["last_name"],
        "stelle": job_title,
        "firma": org["name"],
    }


async def save_uploads(conn, org_id: int, app_id: int, files: list[UploadFile]) -> None:
    files = [f for f in files if f and f.filename][:MAX_FILES]
    for f in files:
        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail=f"Dateityp {ext} ist nicht erlaubt.")
        data = await f.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"{f.filename} ist größer als 10 MB.")
        stored = f"{secrets.token_hex(16)}{ext}"
        (db.UPLOAD_DIR / stored).write_bytes(data)
        conn.execute(
            "INSERT INTO documents (org_id, application_id, filename, stored_name, content_type, size, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (org_id, app_id, Path(f.filename).name[:200], stored,
             f.content_type or "application/octet-stream", len(data), db.now()),
        )


def create_application(conn, org, job, data: dict, source: str, user_id=None) -> int:
    first_stage = stages_for(conn, org["id"])[0]
    ts = db.now()
    cur = conn.execute(
        """INSERT INTO applications (org_id, job_id, stage_id, first_name, last_name, email, phone,
           linkedin, cover_letter, salary_expectation, start_date, source, consent_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (org["id"], job["id"], first_stage["id"], data["first_name"].strip(), data["last_name"].strip(),
         data["email"].strip().lower(), data.get("phone", "").strip(), data.get("linkedin", "").strip(),
         data.get("cover_letter", "").strip(), data.get("salary_expectation", "").strip(),
         data.get("start_date", "").strip(), source, ts, ts, ts),
    )
    app_id = cur.lastrowid
    db.log_activity(conn, org["id"], app_id, user_id, f"Bewerbung eingegangen ({source})")
    return app_id


def _valid_email(email: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email.strip()))


# --------------------------------------------------------------------------- Öffentlich: Landing, Login, Registrierung

@app.get("/", response_class=HTMLResponse)
def landing(request: Request):
    return render(request, "landing.html")


@app.get("/registrieren", response_class=HTMLResponse)
def register_form(request: Request):
    return render(request, "register.html", {"form": {}})


@app.post("/registrieren")
def register(
    request: Request,
    company: str = Form(...), name: str = Form(...), email: str = Form(...),
    password: str = Form(...), csrf: str = Form(""),
):
    check_csrf(request, csrf)
    email = email.strip().lower()
    form = {"company": company, "name": name, "email": email}
    error = None
    if len(password) < 10:
        error = "Das Passwort muss mindestens 10 Zeichen lang sein."
    elif not _valid_email(email):
        error = "Bitte eine gültige E-Mail-Adresse angeben."
    elif not company.strip() or not name.strip():
        error = "Bitte Firmenname und Ihren Namen angeben."
    with db.connect() as conn:
        if not error and conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            error = "Für diese E-Mail-Adresse existiert bereits ein Konto."
        if error:
            return render(request, "register.html", {"form": form, "error": error}, status_code=400)
        base = slugify(company)
        slug, n = base, 2
        while conn.execute("SELECT 1 FROM organizations WHERE slug = ?", (slug,)).fetchone():
            slug, n = f"{base}-{n}", n + 1
        trial_end = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat(timespec="seconds")
        org_id = conn.execute(
            "INSERT INTO organizations (name, slug, plan, trial_ends_at, created_at) VALUES (?, ?, 'trial', ?, ?)",
            (company.strip(), slug, trial_end, db.now()),
        ).lastrowid
        db.seed_organization(conn, org_id)
        uid = conn.execute(
            "INSERT INTO users (org_id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)",
            (org_id, email, name.strip(), hash_password(password), db.now()),
        ).lastrowid
    request.session.clear()
    request.session["uid"] = uid
    flash(request, f"Willkommen bei {APP_NAME}! Ihre {TRIAL_DAYS}-tägige Testphase hat begonnen.")
    return redirect("/app")


@app.get("/login", response_class=HTMLResponse)
def login_form(request: Request, next: str = "/app"):
    return render(request, "login.html", {"next": next})


@app.post("/login")
def login(request: Request, email: str = Form(...), password: str = Form(...),
          next: str = Form("/app"), csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        return render(request, "login.html", {"next": next, "error": "E-Mail oder Passwort ist falsch."},
                      status_code=400)
    request.session.clear()
    request.session["uid"] = user["id"]
    target = next if next.startswith("/app") or next.startswith("/superadmin") else "/app"
    return redirect(target)


@app.post("/logout")
def logout(request: Request, csrf: str = Form("")):
    check_csrf(request, csrf)
    request.session.clear()
    return redirect("/login")


# --------------------------------------------------------------------------- Öffentlich: Karriereseite

def public_org(conn, slug: str):
    org = conn.execute("SELECT * FROM organizations WHERE slug = ?", (slug,)).fetchone()
    if not org:
        raise HTTPException(status_code=404, detail="Karriereseite nicht gefunden.")
    return org


def public_jobs(conn, org):
    if trial_expired(org):
        return []
    return conn.execute(
        "SELECT * FROM jobs WHERE org_id = ? AND status = 'published' ORDER BY published_at DESC",
        (org["id"],),
    ).fetchall()


def public_job(conn, org, job_id: int):
    job = conn.execute(
        "SELECT * FROM jobs WHERE org_id = ? AND id = ? AND status = 'published'", (org["id"], job_id)
    ).fetchone()
    if not job or trial_expired(org):
        raise HTTPException(status_code=404, detail="Diese Stelle ist nicht (mehr) verfügbar.")
    return job


@app.get("/karriere/{slug}", response_class=HTMLResponse)
def career_page(request: Request, slug: str):
    with db.connect() as conn:
        org = public_org(conn, slug)
        jobs = public_jobs(conn, org)
    return render(request, "public/career.html", {"company": org, "jobs": jobs, "user": None, "org": None})


def job_posting_jsonld(org, job, request: Request) -> str:
    data = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": job["title"],
        "description": "\n\n".join(filter(None, [job["description"], job["requirements"], job["benefits"]])),
        "datePosted": (job["published_at"] or job["created_at"])[:10],
        "employmentType": {"Vollzeit": "FULL_TIME", "Teilzeit": "PART_TIME", "Praktikum": "INTERN",
                           "Freelance": "CONTRACTOR", "Minijob": "PART_TIME"}.get(job["employment_type"], "OTHER"),
        "hiringOrganization": {"@type": "Organization", "name": org["name"], "sameAs": org["website"] or None},
        "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress",
                                                      "addressLocality": job["location"], "addressCountry": "DE"}},
        "url": str(request.url),
    }
    if job["remote"] == "Remote":
        data["jobLocationType"] = "TELECOMMUTE"
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


@app.get("/karriere/{slug}/stellen/{job_id}", response_class=HTMLResponse)
def career_job(request: Request, slug: str, job_id: int):
    with db.connect() as conn:
        org = public_org(conn, slug)
        job = public_job(conn, org, job_id)
    return render(request, "public/job.html", {
        "company": org, "job": job, "jsonld": job_posting_jsonld(org, job, request),
        "user": None, "org": None, "form": {},
    })


@app.post("/karriere/{slug}/stellen/{job_id}/bewerben")
async def career_apply(
    request: Request, slug: str, job_id: int,
    first_name: str = Form(...), last_name: str = Form(...), email: str = Form(...),
    phone: str = Form(""), linkedin: str = Form(""), cover_letter: str = Form(""),
    salary_expectation: str = Form(""), start_date: str = Form(""),
    consent: str = Form(""), website: str = Form(""), csrf: str = Form(""),
    files: list[UploadFile] = File(default=[]),
):
    check_csrf(request, csrf)
    form = {"first_name": first_name, "last_name": last_name, "email": email, "phone": phone,
            "linkedin": linkedin, "cover_letter": cover_letter, "salary_expectation": salary_expectation,
            "start_date": start_date}
    with db.connect() as conn:
        org = public_org(conn, slug)
        job = public_job(conn, org, job_id)
        if website:  # Honeypot – Bots füllen dieses versteckte Feld aus
            return redirect(f"/karriere/{slug}/danke")
        error = None
        if not consent:
            error = "Bitte stimmen Sie der Verarbeitung Ihrer Daten zu."
        elif not _valid_email(email):
            error = "Bitte eine gültige E-Mail-Adresse angeben."
        elif not first_name.strip() or not last_name.strip():
            error = "Bitte Vor- und Nachnamen angeben."
        elif not any(f.filename for f in files):
            error = "Bitte laden Sie mindestens ein Dokument (z. B. Lebenslauf) hoch."
        if error:
            return render(request, "public/job.html", {
                "company": org, "job": job, "jsonld": job_posting_jsonld(org, job, request),
                "user": None, "org": None, "form": form, "error": error,
            }, status_code=400)
        app_id = create_application(conn, org, job, form, "Karriereseite")
        await save_uploads(conn, org["id"], app_id, files)
        tpl = conn.execute(
            "SELECT * FROM email_templates WHERE org_id = ? AND key = 'confirmation'", (org["id"],)
        ).fetchone()
        if tpl:
            app_row = get_application(conn, org["id"], app_id)
            values = template_values(org, app_row, job["title"])
            mailer.send(conn, org["id"], app_id, app_row["email"],
                        mailer.render(tpl["subject"], values), mailer.render(tpl["body"], values))
    return redirect(f"/karriere/{slug}/danke")


@app.get("/karriere/{slug}/danke", response_class=HTMLResponse)
def career_thanks(request: Request, slug: str):
    with db.connect() as conn:
        org = public_org(conn, slug)
    return render(request, "public/thanks.html", {"company": org, "user": None, "org": None})


@app.get("/api/public/{slug}/jobs")
def api_public_jobs(request: Request, slug: str):
    """JSON-Feed zum Einbinden der Stellen auf der Firmenwebsite."""
    with db.connect() as conn:
        org = public_org(conn, slug)
        jobs = public_jobs(conn, org)
    base = str(request.base_url).rstrip("/")
    return {
        "company": org["name"],
        "jobs": [{
            "id": j["id"], "title": j["title"], "department": j["department"], "location": j["location"],
            "employment_type": j["employment_type"], "remote": j["remote"], "published_at": j["published_at"],
            "url": f"{base}/karriere/{slug}/stellen/{j['id']}",
        } for j in jobs],
    }


@app.get("/karriere/{slug}/widget.js")
def career_widget(request: Request, slug: str):
    """Einbettbares Widget: <script src=".../widget.js"></script> rendert die Stellenliste."""
    with db.connect() as conn:
        public_org(conn, slug)
    feed = json.dumps(f"{str(request.base_url).rstrip('/')}/api/public/{slug}/jobs")
    js = (
        "(function(){var s=document.currentScript,b=document.createElement('div');b.className='hf-jobs';"
        "s.parentNode.insertBefore(b,s);fetch(" + feed + ").then(function(r){return r.json()}).then(function(d){"
        "if(!d.jobs.length){b.textContent='Aktuell keine offenen Stellen.';return}"
        "var u=document.createElement('ul');d.jobs.forEach(function(j){var l=document.createElement('li'),"
        "a=document.createElement('a');a.href=j.url;a.target='_blank';a.textContent=j.title;l.appendChild(a);"
        "l.appendChild(document.createTextNode(' – '+[j.location,j.employment_type].filter(Boolean).join(', ')));"
        "u.appendChild(l)});b.appendChild(u)})})();"
    )
    return HTMLResponse(js, media_type="application/javascript")


# --------------------------------------------------------------------------- App: Dashboard

@app.get("/app", response_class=HTMLResponse)
def dashboard(request: Request):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        oid = org["id"]
        stats = {
            "open_jobs": conn.execute("SELECT COUNT(*) FROM jobs WHERE org_id=? AND status='published'", (oid,)).fetchone()[0],
            "active": conn.execute("SELECT COUNT(*) FROM applications WHERE org_id=? AND closed_at IS NULL", (oid,)).fetchone()[0],
            "new_7d": conn.execute(
                "SELECT COUNT(*) FROM applications WHERE org_id=? AND julianday('now')-julianday(created_at) <= 7", (oid,)
            ).fetchone()[0],
            "hired": conn.execute(
                "SELECT COUNT(*) FROM applications a JOIN stages s ON s.id=a.stage_id WHERE a.org_id=? AND s.kind='hired'", (oid,)
            ).fetchone()[0],
        }
        tth = conn.execute(
            """SELECT AVG(julianday(a.closed_at) - julianday(a.created_at)) FROM applications a
               JOIN stages s ON s.id = a.stage_id WHERE a.org_id = ? AND s.kind = 'hired'""", (oid,)
        ).fetchone()[0]
        stats["time_to_hire"] = round(tth) if tth is not None else None
        funnel = conn.execute(
            """SELECT s.name, s.kind, COUNT(a.id) AS n FROM stages s
               LEFT JOIN applications a ON a.stage_id = s.id WHERE s.org_id = ?
               GROUP BY s.id ORDER BY s.position""", (oid,)
        ).fetchall()
        sources = conn.execute(
            "SELECT source, COUNT(*) AS n FROM applications WHERE org_id=? GROUP BY source ORDER BY n DESC", (oid,)
        ).fetchall()
        recent = conn.execute(
            """SELECT a.id, a.first_name, a.last_name, a.created_at, j.title AS job_title, s.name AS stage_name
               FROM applications a JOIN jobs j ON j.id=a.job_id JOIN stages s ON s.id=a.stage_id
               WHERE a.org_id=? ORDER BY a.created_at DESC LIMIT 8""", (oid,)
        ).fetchall()
    max_n = max([f["n"] for f in funnel] + [1])
    return render(request, "app/dashboard.html", {
        "stats": stats, "funnel": funnel, "max_n": max_n, "sources": sources, "recent": recent,
        "trial_days_left": _trial_days_left(org),
    })


def _trial_days_left(org):
    if org["plan"] != "trial" or not org["trial_ends_at"]:
        return None
    delta = datetime.fromisoformat(org["trial_ends_at"]) - datetime.now(timezone.utc)
    return max(delta.days, 0)


# --------------------------------------------------------------------------- App: Stellen

@app.get("/app/stellen", response_class=HTMLResponse)
def jobs_list(request: Request):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        jobs = conn.execute(
            """SELECT j.*, COUNT(a.id) AS total, SUM(CASE WHEN a.closed_at IS NULL AND a.id IS NOT NULL THEN 1 ELSE 0 END) AS active
               FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
               WHERE j.org_id = ? GROUP BY j.id
               ORDER BY CASE j.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, j.created_at DESC""",
            (org["id"],),
        ).fetchall()
    return render(request, "app/jobs.html", {"jobs": jobs})


JOB_FIELDS = ("title", "department", "location", "employment_type", "remote", "salary_range",
              "description", "requirements", "benefits")


@app.get("/app/stellen/neu", response_class=HTMLResponse)
def job_new_form(request: Request):
    with db.connect() as conn:
        user, _ = load_user(request, conn)
    require_role(user, "admin", "recruiter")
    return render(request, "app/job_form.html", {"job": None})


async def _job_form_data(request: Request) -> dict:
    form = await request.form()
    check_csrf(request, form.get("csrf"))
    data = {k: str(form.get(k, "")).strip() for k in JOB_FIELDS}
    if not data["title"]:
        raise HTTPException(status_code=400, detail="Bitte einen Stellentitel angeben.")
    return data


@app.post("/app/stellen/neu")
async def job_create(request: Request):
    data = await _job_form_data(request)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        cols = ", ".join(JOB_FIELDS)
        job_id = conn.execute(
            f"INSERT INTO jobs (org_id, {cols}, status, created_at) VALUES (?, {', '.join('?' * len(JOB_FIELDS))}, 'draft', ?)",
            (org["id"], *[data[k] for k in JOB_FIELDS], db.now()),
        ).lastrowid
    flash(request, "Stelle als Entwurf angelegt. Veröffentlichen Sie sie, wenn alles passt.")
    return redirect(f"/app/stellen/{job_id}")


@app.get("/app/stellen/{job_id}", response_class=HTMLResponse)
def job_pipeline(request: Request, job_id: int):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        job = get_job(conn, org["id"], job_id)
        stages = stages_for(conn, org["id"])
        apps = conn.execute(
            """SELECT a.*, (SELECT COUNT(*) FROM notes n WHERE n.application_id = a.id) AS note_count
               FROM applications a WHERE a.org_id = ? AND a.job_id = ? ORDER BY a.created_at DESC""",
            (org["id"], job_id),
        ).fetchall()
    columns = [{"stage": s, "apps": [a for a in apps if a["stage_id"] == s["id"]]} for s in stages]
    return render(request, "app/pipeline.html", {"job": job, "columns": columns, "total": len(apps)})


@app.get("/app/stellen/{job_id}/bearbeiten", response_class=HTMLResponse)
def job_edit_form(request: Request, job_id: int):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        job = get_job(conn, org["id"], job_id)
    return render(request, "app/job_form.html", {"job": job})


@app.post("/app/stellen/{job_id}/bearbeiten")
async def job_update(request: Request, job_id: int):
    data = await _job_form_data(request)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        get_job(conn, org["id"], job_id)
        sets = ", ".join(f"{k} = ?" for k in JOB_FIELDS)
        conn.execute(f"UPDATE jobs SET {sets} WHERE org_id = ? AND id = ?",
                     (*[data[k] for k in JOB_FIELDS], org["id"], job_id))
    flash(request, "Stelle gespeichert.")
    return redirect(f"/app/stellen/{job_id}")


@app.post("/app/stellen/{job_id}/status")
def job_set_status(request: Request, job_id: int, status: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    if status not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="Unbekannter Status.")
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        job = get_job(conn, org["id"], job_id)
        if status == "published" and job["status"] != "published":
            published = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE org_id = ? AND status = 'published'", (org["id"],)
            ).fetchone()[0]
            limit = PLANS[org["plan"]]["jobs"]
            if published >= limit:
                flash(request, f"Ihr Tarif erlaubt {limit} aktive Stellen. Bitte upgraden Sie unter „Abo“.", "error")
                return redirect(f"/app/stellen/{job_id}")
        conn.execute(
            "UPDATE jobs SET status = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END "
            "WHERE org_id = ? AND id = ?",
            (status, status, db.now(), org["id"], job_id),
        )
    flash(request, f"Status geändert: {STATUS_LABELS[status]}.")
    return redirect(f"/app/stellen/{job_id}")


# --------------------------------------------------------------------------- App: Bewerber

@app.get("/app/bewerber", response_class=HTMLResponse)
def applications_list(request: Request, q: str = "", job: int = 0, stage: int = 0, status: str = "aktiv"):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        sql = """SELECT a.*, j.title AS job_title, s.name AS stage_name, s.kind AS stage_kind
                 FROM applications a JOIN jobs j ON j.id=a.job_id JOIN stages s ON s.id=a.stage_id
                 WHERE a.org_id = ?"""
        params: list = [org["id"]]
        if q:
            sql += " AND (a.first_name || ' ' || a.last_name LIKE ? OR a.email LIKE ?)"
            params += [f"%{q}%", f"%{q}%"]
        if job:
            sql += " AND a.job_id = ?"
            params.append(job)
        if stage:
            sql += " AND a.stage_id = ?"
            params.append(stage)
        if status == "aktiv":
            sql += " AND a.closed_at IS NULL"
        elif status == "abgeschlossen":
            sql += " AND a.closed_at IS NOT NULL"
        sql += " ORDER BY a.created_at DESC LIMIT 500"
        apps = conn.execute(sql, params).fetchall()
        jobs = conn.execute("SELECT id, title FROM jobs WHERE org_id = ? ORDER BY title", (org["id"],)).fetchall()
        stages = stages_for(conn, org["id"])
    return render(request, "app/applications.html", {
        "apps": apps, "jobs": jobs, "stages": stages,
        "filters": {"q": q, "job": job, "stage": stage, "status": status},
    })


@app.get("/app/bewerber/neu", response_class=HTMLResponse)
def application_new_form(request: Request, job: int = 0):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        jobs = conn.execute("SELECT id, title FROM jobs WHERE org_id = ? AND status != 'closed' ORDER BY title",
                            (org["id"],)).fetchall()
    return render(request, "app/application_new.html", {"jobs": jobs, "selected_job": job})


@app.post("/app/bewerber/neu")
async def application_create(
    request: Request, job_id: int = Form(...), first_name: str = Form(...), last_name: str = Form(...),
    email: str = Form(...), phone: str = Form(""), linkedin: str = Form(""), source: str = Form("Manuell"),
    cover_letter: str = Form(""), csrf: str = Form(""), files: list[UploadFile] = File(default=[]),
):
    check_csrf(request, csrf)
    if not _valid_email(email):
        raise HTTPException(status_code=400, detail="Bitte eine gültige E-Mail-Adresse angeben.")
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        job = get_job(conn, org["id"], job_id)
        data = {"first_name": first_name, "last_name": last_name, "email": email, "phone": phone,
                "linkedin": linkedin, "cover_letter": cover_letter}
        app_id = create_application(conn, org, job, data, source.strip() or "Manuell", user["id"])
        await save_uploads(conn, org["id"], app_id, files)
    flash(request, "Bewerber:in angelegt.")
    return redirect(f"/app/bewerber/{app_id}")


@app.get("/app/bewerber/{app_id}", response_class=HTMLResponse)
def application_detail(request: Request, app_id: int):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        a = get_application(conn, org["id"], app_id)
        docs = conn.execute("SELECT * FROM documents WHERE org_id=? AND application_id=?", (org["id"], app_id)).fetchall()
        notes = conn.execute(
            """SELECT n.*, u.name AS author FROM notes n LEFT JOIN users u ON u.id = n.user_id
               WHERE n.org_id=? AND n.application_id=? ORDER BY n.created_at DESC""", (org["id"], app_id)
        ).fetchall()
        activities = conn.execute(
            """SELECT ac.*, u.name AS author FROM activities ac LEFT JOIN users u ON u.id = ac.user_id
               WHERE ac.org_id=? AND ac.application_id=? ORDER BY ac.id DESC""", (org["id"], app_id)
        ).fetchall()
        emails = conn.execute(
            "SELECT * FROM emails_sent WHERE org_id=? AND application_id=? ORDER BY id DESC", (org["id"], app_id)
        ).fetchall()
        tpls = conn.execute("SELECT * FROM email_templates WHERE org_id=? ORDER BY id", (org["id"],)).fetchall()
        stages = stages_for(conn, org["id"])
        others = conn.execute(
            """SELECT a.id, j.title FROM applications a JOIN jobs j ON j.id=a.job_id
               WHERE a.org_id=? AND a.email=? AND a.id != ?""", (org["id"], a["email"], app_id)
        ).fetchall()
    values = template_values(org, a, a["job_title"])
    rendered_tpls = [{"key": t["key"], "name": t["name"], "subject": mailer.render(t["subject"], values),
                      "body": mailer.render(t["body"], values)} for t in tpls]
    return render(request, "app/application_detail.html", {
        "a": a, "docs": docs, "notes": notes, "activities": activities, "emails": emails,
        "tpls": rendered_tpls, "stages": stages, "others": others,
    })


def _move_stage(conn, org, user, a, stage_id: int, send_mail: bool) -> None:
    stage = conn.execute("SELECT * FROM stages WHERE org_id=? AND id=?", (org["id"], stage_id)).fetchone()
    if not stage:
        raise HTTPException(status_code=400, detail="Unbekannte Phase.")
    if stage["id"] == a["stage_id"]:
        return
    closed_at = db.now() if stage["kind"] in ("hired", "rejected") else None
    conn.execute("UPDATE applications SET stage_id=?, closed_at=?, updated_at=? WHERE org_id=? AND id=?",
                 (stage["id"], closed_at, db.now(), org["id"], a["id"]))
    db.log_activity(conn, org["id"], a["id"], user["id"], f"Phase: {a['stage_name']} → {stage['name']}")
    if send_mail and stage["kind"] in ("rejected", "hired"):
        key = "rejection" if stage["kind"] == "rejected" else "offer"
        tpl = conn.execute("SELECT * FROM email_templates WHERE org_id=? AND key=?", (org["id"], key)).fetchone()
        if tpl:
            values = template_values(org, a, a["job_title"])
            subject = mailer.render(tpl["subject"], values)
            status = mailer.send(conn, org["id"], a["id"], a["email"], subject, mailer.render(tpl["body"], values))
            db.log_activity(conn, org["id"], a["id"], user["id"], f"E-Mail „{subject}“ – {status}")


@app.post("/app/bewerber/{app_id}/phase")
async def application_stage(request: Request, app_id: int):
    is_json = request.headers.get("content-type", "").startswith("application/json")
    if is_json:
        payload = await request.json()
        check_csrf(request, request.headers.get("x-csrf-token"))
    else:
        payload = dict(await request.form())
        check_csrf(request, payload.get("csrf"))
    try:
        stage_id = int(payload.get("stage_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Phase fehlt.")
    send_mail = str(payload.get("send_mail", "")).lower() in ("1", "true", "on")
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        a = get_application(conn, org["id"], app_id)
        _move_stage(conn, org, user, a, stage_id, send_mail)
    if is_json:
        return {"ok": True}
    flash(request, "Phase aktualisiert.")
    return redirect(f"/app/bewerber/{app_id}")


@app.post("/app/bewerber/{app_id}/bewertung")
def application_rate(request: Request, app_id: int, rating: int = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    rating = max(0, min(5, rating))
    with db.connect() as conn:
        user, org = load_user(request, conn)
        get_application(conn, org["id"], app_id)
        conn.execute("UPDATE applications SET rating=?, updated_at=? WHERE org_id=? AND id=?",
                     (rating, db.now(), org["id"], app_id))
        db.log_activity(conn, org["id"], app_id, user["id"], f"Bewertung: {rating} von 5 Sternen")
    return redirect(f"/app/bewerber/{app_id}")


@app.post("/app/bewerber/{app_id}/notiz")
def application_note(request: Request, app_id: int, body: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    if not body.strip():
        return redirect(f"/app/bewerber/{app_id}")
    with db.connect() as conn:
        user, org = load_user(request, conn)
        get_application(conn, org["id"], app_id)
        conn.execute("INSERT INTO notes (org_id, application_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
                     (org["id"], app_id, user["id"], body.strip(), db.now()))
    return redirect(f"/app/bewerber/{app_id}#notizen")


@app.post("/app/bewerber/{app_id}/email")
def application_email(request: Request, app_id: int, subject: str = Form(...), body: str = Form(...),
                      csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        a = get_application(conn, org["id"], app_id)
        status = mailer.send(conn, org["id"], app_id, a["email"], subject.strip(), body)
        db.log_activity(conn, org["id"], app_id, user["id"], f"E-Mail „{subject.strip()}“ – {status}")
    flash(request, f"E-Mail: {status}.")
    return redirect(f"/app/bewerber/{app_id}")


@app.get("/app/bewerber/{app_id}/export")
def application_export(request: Request, app_id: int):
    """DSGVO Art. 15/20: alle gespeicherten Daten einer Person als JSON."""
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        a = get_application(conn, org["id"], app_id)
        data = {
            "bewerbung": dict(a),
            "dokumente": [dict(r) for r in conn.execute(
                "SELECT filename, content_type, size, created_at FROM documents WHERE org_id=? AND application_id=?",
                (org["id"], app_id))],
            "notizen": [dict(r) for r in conn.execute(
                "SELECT body, created_at FROM notes WHERE org_id=? AND application_id=?", (org["id"], app_id))],
            "verlauf": [dict(r) for r in conn.execute(
                "SELECT message, created_at FROM activities WHERE org_id=? AND application_id=?", (org["id"], app_id))],
            "emails": [dict(r) for r in conn.execute(
                "SELECT to_email, subject, body, status, created_at FROM emails_sent WHERE org_id=? AND application_id=?",
                (org["id"], app_id))],
        }
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="bewerbung-{app_id}.json"'})


@app.post("/app/bewerber/{app_id}/loeschen")
def application_delete(request: Request, app_id: int, csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin", "recruiter")
        a = get_application(conn, org["id"], app_id)
        db.delete_application(conn, org["id"], app_id)
    flash(request, f"Bewerbung von {a['first_name']} {a['last_name']} wurde endgültig gelöscht.")
    return redirect(f"/app/stellen/{a['job_id']}")


@app.get("/app/dokumente/{doc_id}")
def document_download(request: Request, doc_id: int):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        doc = conn.execute("SELECT * FROM documents WHERE org_id=? AND id=?", (org["id"], doc_id)).fetchone()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden.")
    path = db.UPLOAD_DIR / doc["stored_name"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Datei fehlt auf dem Server.")
    inline = doc["stored_name"].endswith((".pdf", ".png", ".jpg", ".jpeg"))
    return FileResponse(path, media_type=doc["content_type"], filename=doc["filename"],
                        content_disposition_type="inline" if inline else "attachment")


# --------------------------------------------------------------------------- App: Team

@app.get("/app/team", response_class=HTMLResponse)
def team(request: Request):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        members = conn.execute("SELECT * FROM users WHERE org_id=? ORDER BY created_at", (org["id"],)).fetchall()
    return render(request, "app/team.html", {"members": members})


@app.post("/app/team")
def team_add(request: Request, name: str = Form(...), email: str = Form(...), role: str = Form("recruiter"),
             password: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    email = email.strip().lower()
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        if role not in ROLES:
            raise HTTPException(status_code=400, detail="Unbekannte Rolle.")
        if len(password) < 10 or not _valid_email(email):
            flash(request, "Bitte gültige E-Mail und ein Passwort mit mind. 10 Zeichen angeben.", "error")
            return redirect("/app/team")
        count = conn.execute("SELECT COUNT(*) FROM users WHERE org_id=?", (org["id"],)).fetchone()[0]
        if count >= PLANS[org["plan"]]["users"]:
            flash(request, "Die Nutzeranzahl Ihres Tarifs ist erreicht. Bitte upgraden Sie unter „Abo“.", "error")
            return redirect("/app/team")
        if conn.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            flash(request, "Diese E-Mail-Adresse wird bereits verwendet.", "error")
            return redirect("/app/team")
        conn.execute(
            "INSERT INTO users (org_id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (org["id"], email, name.strip(), hash_password(password), role, db.now()),
        )
    flash(request, f"{name} wurde hinzugefügt. Teilen Sie das Startpasswort bitte auf sicherem Weg.")
    return redirect("/app/team")


@app.post("/app/team/{uid}/loeschen")
def team_remove(request: Request, uid: int, csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        if uid == user["id"]:
            flash(request, "Sie können sich nicht selbst entfernen.", "error")
            return redirect("/app/team")
        conn.execute("DELETE FROM users WHERE org_id=? AND id=?", (org["id"], uid))
    flash(request, "Teammitglied entfernt.")
    return redirect("/app/team")


@app.post("/app/passwort")
def change_password(request: Request, current: str = Form(...), new: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, _ = load_user(request, conn, allow_expired=True)
        if not verify_password(current, user["password_hash"]):
            flash(request, "Das aktuelle Passwort ist falsch.", "error")
        elif len(new) < 10:
            flash(request, "Das neue Passwort muss mindestens 10 Zeichen lang sein.", "error")
        else:
            conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(new), user["id"]))
            flash(request, "Passwort geändert.")
    return redirect("/app/team")


# --------------------------------------------------------------------------- App: Einstellungen

@app.get("/app/einstellungen", response_class=HTMLResponse)
def settings(request: Request):
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        tpls = conn.execute("SELECT * FROM email_templates WHERE org_id=? ORDER BY id", (org["id"],)).fetchall()
        stages = conn.execute(
            """SELECT s.*, (SELECT COUNT(*) FROM applications a WHERE a.stage_id = s.id) AS n
               FROM stages s WHERE s.org_id=? ORDER BY s.position""", (org["id"],)
        ).fetchall()
    base = str(request.base_url).rstrip("/")
    return render(request, "app/settings.html", {"tpls": tpls, "stages": stages, "base": base})


@app.post("/app/einstellungen")
def settings_save(request: Request, name: str = Form(...), website: str = Form(""), about: str = Form(""),
                  primary_color: str = Form("#2563eb"), retention_days: int = Form(180), csrf: str = Form("")):
    check_csrf(request, csrf)
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", primary_color):
        primary_color = "#2563eb"
    retention_days = max(30, min(3650, retention_days))
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        conn.execute("UPDATE organizations SET name=?, website=?, about=?, primary_color=?, retention_days=? WHERE id=?",
                     (name.strip() or org["name"], website.strip(), about.strip(), primary_color, retention_days, org["id"]))
    flash(request, "Einstellungen gespeichert.")
    return redirect("/app/einstellungen")


@app.post("/app/einstellungen/vorlagen/{tpl_id}")
def template_save(request: Request, tpl_id: int, subject: str = Form(...), body: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        conn.execute("UPDATE email_templates SET subject=?, body=? WHERE org_id=? AND id=?",
                     (subject.strip(), body, org["id"], tpl_id))
    flash(request, "Vorlage gespeichert.")
    return redirect("/app/einstellungen#vorlagen")


@app.post("/app/einstellungen/phasen")
def stage_add(request: Request, name: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        # Neue offene Phasen landen vor den Abschluss-Phasen (Eingestellt/Abgelehnt)
        first_closed = conn.execute(
            "SELECT MIN(position) FROM stages WHERE org_id=? AND kind != 'open'", (org["id"],)
        ).fetchone()[0]
        pos = first_closed if first_closed is not None else 999
        conn.execute("UPDATE stages SET position = position + 1 WHERE org_id=? AND position >= ?", (org["id"], pos))
        conn.execute("INSERT INTO stages (org_id, name, position, kind) VALUES (?, ?, ?, 'open')",
                     (org["id"], name.strip()[:40] or "Neue Phase", pos))
    flash(request, "Phase hinzugefügt.")
    return redirect("/app/einstellungen#phasen")


@app.post("/app/einstellungen/phasen/{stage_id}")
def stage_update(request: Request, stage_id: int, name: str = Form(""), action: str = Form("rename"),
                 csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, org = load_user(request, conn)
        require_role(user, "admin")
        stage = conn.execute("SELECT * FROM stages WHERE org_id=? AND id=?", (org["id"], stage_id)).fetchone()
        if not stage:
            raise HTTPException(status_code=404, detail="Phase nicht gefunden.")
        if action == "delete":
            used = conn.execute("SELECT COUNT(*) FROM applications WHERE stage_id=?", (stage_id,)).fetchone()[0]
            if stage["kind"] != "open" or used:
                flash(request, "Nur leere, offene Phasen können gelöscht werden.", "error")
            else:
                conn.execute("DELETE FROM stages WHERE id=?", (stage_id,))
                flash(request, "Phase gelöscht.")
        elif name.strip():
            conn.execute("UPDATE stages SET name=? WHERE id=?", (name.strip()[:40], stage_id))
            flash(request, "Phase umbenannt.")
    return redirect("/app/einstellungen#phasen")


@app.post("/app/einstellungen/bereinigen")
def settings_purge(request: Request, csrf: str = Form("")):
    check_csrf(request, csrf)
    with db.connect() as conn:
        user, _ = load_user(request, conn)
        require_role(user, "admin")
        n = db.purge_expired(conn)
    flash(request, f"{n} abgelaufene Bewerbung(en) gelöscht.")
    return redirect("/app/einstellungen")


# --------------------------------------------------------------------------- Abo & Superadmin

@app.get("/app/abo", response_class=HTMLResponse)
def subscription(request: Request):
    with db.connect() as conn:
        user, org = load_user(request, conn, allow_expired=True)
        usage = {
            "jobs": conn.execute("SELECT COUNT(*) FROM jobs WHERE org_id=? AND status='published'", (org["id"],)).fetchone()[0],
            "users": conn.execute("SELECT COUNT(*) FROM users WHERE org_id=?", (org["id"],)).fetchone()[0],
        }
    return render(request, "app/subscription.html", {
        "usage": usage, "expired": trial_expired(org), "trial_days_left": _trial_days_left(org),
        "sales_email": os.environ.get("SALES_EMAIL", "vertrieb@example.com"),
    })


def _require_superadmin(request: Request, conn):
    user, org = load_user(request, conn, allow_expired=True)
    if not SUPERADMIN_EMAIL or user["email"] != SUPERADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    return user


@app.get("/superadmin", response_class=HTMLResponse)
def superadmin(request: Request):
    with db.connect() as conn:
        _require_superadmin(request, conn)
        orgs = conn.execute(
            """SELECT o.*,
                 (SELECT COUNT(*) FROM users u WHERE u.org_id=o.id) AS users,
                 (SELECT COUNT(*) FROM jobs j WHERE j.org_id=o.id AND j.status='published') AS jobs,
                 (SELECT COUNT(*) FROM applications a WHERE a.org_id=o.id) AS apps
               FROM organizations o ORDER BY o.created_at DESC"""
        ).fetchall()
    mrr = sum(PLANS[o["plan"]]["price"] for o in orgs)
    return render(request, "app/superadmin.html", {"orgs": orgs, "mrr": mrr})


@app.post("/superadmin/{org_id}/plan")
def superadmin_plan(request: Request, org_id: int, plan: str = Form(...), csrf: str = Form("")):
    check_csrf(request, csrf)
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail="Unbekannter Tarif.")
    with db.connect() as conn:
        _require_superadmin(request, conn)
        trial_end = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat(timespec="seconds")
        conn.execute("UPDATE organizations SET plan=?, trial_ends_at=CASE WHEN ?='trial' THEN ? ELSE NULL END WHERE id=?",
                     (plan, plan, trial_end, org_id))
    flash(request, "Tarif aktualisiert.")
    return redirect("/superadmin")
