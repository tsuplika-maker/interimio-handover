"""SQLite-Datenhaltung. Jede Tabelle mit Mandantenbezug trägt eine org_id."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DB_PATH = Path(os.environ.get("DB_PATH", DATA_DIR / "hireflow.db"))
UPLOAD_DIR = DATA_DIR / "uploads"

SCHEMA = """
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'trial',
    trial_ends_at TEXT,
    primary_color TEXT NOT NULL DEFAULT '#2563eb',
    website TEXT DEFAULT '',
    about TEXT DEFAULT '',
    retention_days INTEGER NOT NULL DEFAULT 180,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'recruiter',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    department TEXT DEFAULT '',
    location TEXT DEFAULT '',
    employment_type TEXT DEFAULT 'Vollzeit',
    remote TEXT DEFAULT 'Vor Ort',
    salary_range TEXT DEFAULT '',
    description TEXT DEFAULT '',
    requirements TEXT DEFAULT '',
    benefits TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    published_at TEXT
);
CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES stages(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    linkedin TEXT DEFAULT '',
    cover_letter TEXT DEFAULT '',
    salary_expectation TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    source TEXT DEFAULT 'Karriereseite',
    rating INTEGER NOT NULL DEFAULT 0,
    consent_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    UNIQUE(org_id, key)
);
CREATE TABLE IF NOT EXISTS emails_sent (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_org ON applications(org_id, job_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs(org_id, status);
"""

DEFAULT_STAGES = [
    ("Eingegangen", "open"),
    ("Vorauswahl", "open"),
    ("Interview", "open"),
    ("Angebot", "open"),
    ("Eingestellt", "hired"),
    ("Abgelehnt", "rejected"),
]

DEFAULT_TEMPLATES = [
    (
        "confirmation",
        "Eingangsbestätigung",
        "Ihre Bewerbung als {{stelle}} bei {{firma}}",
        "Hallo {{vorname}} {{nachname}},\n\nvielen Dank für Ihre Bewerbung als {{stelle}}. "
        "Wir haben Ihre Unterlagen erhalten und melden uns so schnell wie möglich bei Ihnen.\n\n"
        "Viele Grüße\nIhr Recruiting-Team von {{firma}}",
    ),
    (
        "invitation",
        "Einladung zum Gespräch",
        "Einladung zum Kennenlernen – {{stelle}}",
        "Hallo {{vorname}} {{nachname}},\n\nIhre Bewerbung hat uns überzeugt! Wir würden Sie gerne "
        "persönlich kennenlernen. Bitte teilen Sie uns mit, welche Termine Ihnen in den nächsten "
        "Tagen passen.\n\nViele Grüße\nIhr Recruiting-Team von {{firma}}",
    ),
    (
        "rejection",
        "Absage",
        "Ihre Bewerbung als {{stelle}}",
        "Hallo {{vorname}} {{nachname}},\n\nvielen Dank für Ihr Interesse an {{firma}}. Nach "
        "sorgfältiger Prüfung haben wir uns leider für andere Kandidat:innen entschieden. "
        "Wir wünschen Ihnen für Ihren weiteren Weg alles Gute.\n\nViele Grüße\n"
        "Ihr Recruiting-Team von {{firma}}",
    ),
    (
        "offer",
        "Angebot",
        "Ihr Angebot von {{firma}}",
        "Hallo {{vorname}} {{nachname}},\n\nwir freuen uns, Ihnen die Position {{stelle}} "
        "anbieten zu dürfen! Die Details zum Vertrag erhalten Sie in Kürze.\n\n"
        "Viele Grüße\nIhr Recruiting-Team von {{firma}}",
    ),
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def seed_organization(conn: sqlite3.Connection, org_id: int) -> None:
    for pos, (name, kind) in enumerate(DEFAULT_STAGES):
        conn.execute(
            "INSERT INTO stages (org_id, name, position, kind) VALUES (?, ?, ?, ?)",
            (org_id, name, pos, kind),
        )
    for key, name, subject, body in DEFAULT_TEMPLATES:
        conn.execute(
            "INSERT INTO email_templates (org_id, key, name, subject, body) VALUES (?, ?, ?, ?, ?)",
            (org_id, key, name, subject, body),
        )


def log_activity(conn, org_id: int, application_id: int, user_id, message: str) -> None:
    conn.execute(
        "INSERT INTO activities (org_id, application_id, user_id, message, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (org_id, application_id, user_id, message, now()),
    )


def delete_application(conn, org_id: int, application_id: int) -> None:
    """Löscht eine Bewerbung inkl. Dateien auf der Platte."""
    docs = conn.execute(
        "SELECT stored_name FROM documents WHERE org_id = ? AND application_id = ?",
        (org_id, application_id),
    ).fetchall()
    for d in docs:
        (UPLOAD_DIR / d["stored_name"]).unlink(missing_ok=True)
    conn.execute("DELETE FROM applications WHERE org_id = ? AND id = ?", (org_id, application_id))


def purge_expired(conn) -> int:
    """DSGVO: entfernt abgeschlossene Bewerbungen nach Ablauf der Aufbewahrungsfrist."""
    rows = conn.execute(
        """
        SELECT a.id, a.org_id FROM applications a
        JOIN organizations o ON o.id = a.org_id
        WHERE a.closed_at IS NOT NULL
          AND julianday('now') - julianday(a.closed_at) > o.retention_days
        """
    ).fetchall()
    for r in rows:
        delete_application(conn, r["org_id"], r["id"])
    return len(rows)
