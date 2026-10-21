"""Legt eine Demo-Firma mit Stellen und Bewerbungen an – für Vertriebs-Demos.

Aufruf: python -m app.demo   (Login: demo@hireflow.local / demo-passwort)
"""
import random

from . import db
from .security import hash_password

JOBS = [
    ("Vertriebsmitarbeiter Innendienst (m/w/d)", "Vertrieb", "Hamburg", "Vollzeit", "Hybrid", "45.000–55.000 €"),
    ("Senior Backend Entwickler (m/w/d)", "IT", "Berlin", "Vollzeit", "Remote", "70.000–85.000 €"),
    ("Buchhalter (m/w/d)", "Finanzen", "München", "Teilzeit", "Vor Ort", "nach Vereinbarung"),
    ("Ausbildung Industriekaufmann/-frau 2027", "Ausbildung", "Hamburg", "Ausbildung", "Vor Ort", ""),
]
NAMES = ["Lena Schmidt", "Jonas Weber", "Aylin Demir", "Lukas Becker", "Sophie Wagner", "Mehmet Yilmaz",
         "Hannah Hoffmann", "Felix Schulz", "Mia Koch", "Paul Richter", "Emma Klein", "Noah Wolf",
         "Lea Neumann", "Ben Schwarz", "Marie Zimmermann", "Tim Braun"]
SOURCES = ["Karriereseite", "Karriereseite", "Karriereseite", "Empfehlung", "Jobbörse", "Active Sourcing"]


def main() -> None:
    db.init_db()
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM organizations WHERE slug = 'demo'").fetchone():
            print("Demo existiert bereits: /karriere/demo · demo@hireflow.local / demo-passwort")
            return
        org_id = conn.execute(
            "INSERT INTO organizations (name, slug, plan, about, primary_color, created_at) "
            "VALUES ('Nordwind Logistik GmbH', 'demo', 'business', ?, '#0f766e', ?)",
            ("Wir bewegen Waren in ganz Europa – mit 250 Kolleg:innen an drei Standorten.", db.now()),
        ).lastrowid
        db.seed_organization(conn, org_id)
        conn.execute(
            "INSERT INTO users (org_id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)",
            (org_id, "demo@hireflow.local", "Dana Demo", hash_password("demo-passwort"), db.now()),
        )
        stages = conn.execute("SELECT * FROM stages WHERE org_id = ? ORDER BY position", (org_id,)).fetchall()
        rnd = random.Random(42)
        for title, dept, loc, etype, remote, salary in JOBS:
            job_id = conn.execute(
                """INSERT INTO jobs (org_id, title, department, location, employment_type, remote, salary_range,
                   description, requirements, benefits, status, created_at, published_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)""",
                (org_id, title, dept, loc, etype, remote, salary,
                 "• Spannende Aufgaben in einem wachsenden Team\n• Eigenverantwortliches Arbeiten",
                 "• Abgeschlossene Ausbildung oder Studium\n• Teamgeist und Kommunikationsstärke",
                 "• 30 Tage Urlaub\n• Jobrad & Deutschlandticket\n• Flexible Arbeitszeiten",
                 db.now(), db.now()),
            ).lastrowid
            for name in rnd.sample(NAMES, rnd.randint(5, 9)):
                first, last = name.split(" ")
                stage = rnd.choices(stages, weights=[5, 4, 3, 1, 1, 2])[0]
                ts = db.now()
                app_id = conn.execute(
                    """INSERT INTO applications (org_id, job_id, stage_id, first_name, last_name, email, source,
                       rating, consent_at, created_at, updated_at, closed_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (org_id, job_id, stage["id"], first, last, f"{first}.{last}@example.com".lower(),
                     rnd.choice(SOURCES), rnd.randint(0, 5), ts, ts, ts,
                     ts if stage["kind"] != "open" else None),
                ).lastrowid
                db.log_activity(conn, org_id, app_id, None, "Bewerbung eingegangen (Demo)")
    print("Demo angelegt: /karriere/demo · Login demo@hireflow.local / demo-passwort")


if __name__ == "__main__":
    main()
