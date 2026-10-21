# HireFlow – Bewerbermanagement (ATS) für Unternehmen

Mandantenfähige SaaS-Software für Bewerbermanagement, vergleichbar mit onapply, Personio Recruiting oder JOIN.
Mehrere Firmen nutzen eine Installation, jede mit eigenen Daten, eigener Karriereseite und eigenem Team.
Der Produktname ist über `APP_NAME` frei wählbar (z. B. für White-Label-Vertrieb).

## Funktionsumfang

| Bereich | Funktionen |
|---|---|
| **Selbst-Registrierung** | Firma registriert sich selbst, 14 Tage Testphase, danach Sperre bis zur Tarifwahl |
| **Stellen** | Anlegen/Bearbeiten, Entwurf → veröffentlicht → geschlossen, Abteilung, Standort, Gehalt, Remote |
| **Karriereseite** | `/karriere/<firma>` in Firmenfarbe, Bewerbungsformular mit Upload (PDF/Word/Bild, max. 10 MB), Spam-Honeypot |
| **Google for Jobs** | Jede Stellenanzeige enthält strukturierte `JobPosting`-Daten (schema.org) |
| **Einbindung** | JS-Widget (`<script src=".../widget.js">`) und JSON-Feed für die Firmenwebsite |
| **Pipeline** | Kanban-Board pro Stelle mit Drag & Drop, Phasen frei konfigurierbar |
| **Bewerberprofil** | Kontaktdaten, Dokumente, Notizen, 1–5 Sterne, Verlauf, Hinweis auf Mehrfachbewerbungen |
| **E-Mail** | Automatische Eingangsbestätigung; Vorlagen für Einladung, Absage und Angebot mit Platzhaltern; SMTP-Versand |
| **Team & Rollen** | Admin, Recruiter, Fachbereich (nur lesen und kommentieren) |
| **Kennzahlen** | Offene Stellen, aktive Bewerbungen, Funnel, Quellen, Time-to-Hire |
| **DSGVO** | Einwilligung mit Zeitstempel, konfigurierbare Löschfrist, automatische Löschung, JSON-Export (Art. 15/20), Löschen pro Person |
| **Tarife** | Starter / Business / Enterprise mit Limits für Stellen und Nutzer |
| **Superadmin** | Kundenübersicht mit MRR, Tarif pro Kunde setzen (für Sie als Anbieter) |

## Schnellstart (lokal)

```bash
cd bewerbermanagement
pip install -r requirements-dev.txt
python -m app.demo                       # optional: Demo-Firma „Nordwind Logistik“ anlegen
uvicorn app.main:app --reload
```

- Landingpage: http://localhost:8000
- Demo-Login: `demo@hireflow.local` / `demo-passwort`
- Demo-Karriereseite: http://localhost:8000/karriere/demo

Tests: `python -m pytest -q`

## Produktivbetrieb (Docker)

```bash
cp env.example .env        # SECRET_KEY, SUPERADMIN_EMAIL, SMTP-Daten eintragen
docker compose up -d --build
```

Davor gehört ein Reverse-Proxy mit HTTPS (z. B. Caddy, Traefik oder nginx). Mit `COOKIE_SECURE=1` werden
Sitzungscookies nur über HTTPS gesendet. Alle Daten (SQLite-Datenbank und Uploads) liegen im Volume `/data`,
das regelmäßig gesichert werden sollte.

| Variable | Bedeutung |
|---|---|
| `APP_NAME` | Produktname in der Oberfläche |
| `SECRET_KEY` | Langer Zufallswert zum Signieren der Sitzungen (**Pflicht**) |
| `COOKIE_SECURE` | `1` hinter HTTPS |
| `SUPERADMIN_EMAIL` | Dieses Konto sieht `/superadmin` (Kunden, Tarife, MRR) |
| `SALES_EMAIL` | Ziel der „Tarif anfragen“-Buttons |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SENDER_EMAIL`, `SENDER_NAME` | E-Mail-Versand (Port 465 = SSL, sonst STARTTLS). Ohne `SMTP_HOST` werden Mails nur protokolliert. |

## Vor dem Verkauf

Die Software ist ein funktionsfähiges MVP. Für den kommerziellen Vertrieb fehlen noch:

1. **Rechtliches:** Impressum, Datenschutzerklärung, AGB und ein Auftragsverarbeitungsvertrag (AVV) für Ihre Kunden.
   Die DSGVO-Funktionen helfen, ersetzen aber keine rechtliche Prüfung.
2. **Zahlung:** Tarife werden derzeit manuell über `/superadmin` gesetzt. Als nächster Schritt bietet sich
   Stripe Billing (Checkout und Kundenportal) an.
3. **Passwort vergessen:** Ein Reset per E-Mail fehlt noch. Bis dahin setzt ein Admin neue Startpasswörter.
4. **Skalierung:** SQLite reicht für viele Dutzend Kunden. Bei deutlich mehr Last empfiehlt sich PostgreSQL
   und ein Objektspeicher (S3) für Uploads.
5. **Ausbaustufen, nach denen Kunden häufig fragen:** Multiposting auf Jobbörsen (Indeed, StepStone),
   Interview-Terminbuchung, Kalender-Integration, Fragebögen pro Stelle, SSO, Audit-Log und mehrsprachige Karriereseiten.

## Aufbau

```
app/
  main.py        Routen (öffentlich, App, Superadmin)
  db.py          SQLite-Schema, Standardphasen und -vorlagen, DSGVO-Löschung
  security.py    Passwort-Hashing (PBKDF2), CSRF, Rollen, Tarife
  mailer.py      SMTP-Versand und Platzhalter
  demo.py        Demo-Daten für Vertriebsvorführungen
  templates/     Jinja2-Oberfläche (Deutsch)
  static/        CSS und Kanban-Skript (ohne Build-Schritt)
tests/           Ende-zu-Ende-Tests inkl. Mandantentrennung
```
