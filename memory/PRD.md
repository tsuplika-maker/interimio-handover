# Interimio – PRD

## Original Problem Statement
Plattform, die Interim Manager mit Kunden (Clients) verbindet. Brand: Interimio, Farbe Blau, Währung EUR.
- Clients zahlen 20 % Servicegebühr (Tagessatz × Tage × 0,2).
- Manager: **kostenlos** (Änderung Juni 2026, vorher €299/Monat). Später optionale **Pro-Version** (Lern-/Wissensdaten, Podcast-Vorabzugriff, Insights früher). Rabattcodes bleiben für Pro erhalten.
- Rollenbasierte Registrierung (Manager/Client) mit E-Mail-OTP (SendGrid). SMS-OTP (Twilio) bewusst deaktiviert.
- Clients müssen eingeloggt + verifiziert sein, um Manager anzufragen.
- Lernplattform (Kurse, Lektionen, Fortschritt) und Podcast (Podigee-Embeds) nur für Mitglieder. Name bleibt "Podcast" (kein "Podiac").
- Sprache des Users: Deutsch. UI-Copy aktuell Englisch.

## Architektur
- `/app/backend/server.py` – FastAPI, Motor/MongoDB (UUIDs), JWT (python-jose, bcrypt via passlib), SendGrid.
- `/app/frontend/src/App.js` – Router, Auth-Hook, Home-Sektionen (Hero, Directory, ManagerJoinCard, Learning, Podcast), Dialoge.
- `/app/frontend/src/pages/` – `ManagerDetailPage.jsx` (/managers/:id), `ManagerProfilePage.jsx` (/profile), `AdminPage.jsx` (/admin).
- `/app/frontend/src/components/` – `RequestDialog.jsx`, `admin/AdminLeads.jsx`, `admin/AdminDiscountCodes.jsx`.
- `/app/frontend/src/lib/api.js` (axios helper mit Bearer), `/app/frontend/src/context/AuthContext.jsx`.
- Admin wird beim Start idempotent aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` (backend/.env) geseedet. Credentials: `/app/memory/test_credentials.md`.

## DB Collections
users, otps, managers (user_id, industries, languages, years_experience, linkedin_url, highlights, about), leads (status, manager_name, client_user_id), discount_codes, discount_redemptions, pro_interest, courses, lessons, enrollments, podcasts.

## Implementiert
- 2025-08: Manager-Verzeichnis + Filter, Lead-Flow mit 20 % Gebühr, JWT-Auth + Rollen + E-Mail-OTP, Lernplattform, Podcast (Podigee), Member-Gating, Kurs-Filter.
- 2026-06 (diese Session):
  - Manager-Preise entfernt → kostenlos; "Interimio Pro – Coming soon"-Karte mit Benefits + Warteliste (`POST /api/pro/interest`, optionaler Rabattcode → Redemption).
  - Admin-Rolle + Seeding, `require_admin`. Admin-Seite `/admin`: Stats, Lead-Inbox (Filter, Suche, Status new/contacted/qualified/won/lost, CSV-Export), Rabattcodes (anlegen, aktiv/inaktiv, löschen, Nutzungen).
  - Manager-Detailseiten `/managers/:id` mit Track Record, Branchen, Sprachen, Verfügbarkeit, LinkedIn, Gebührenrechner + Request-CTA.
  - Manager-Profilseite `/profile` (anlegen/bearbeiten, Upsert per user_id).
  - Fixes: OTP-Verify naive/aware datetime (500), Header-Update nach Login ohne Reload, Seed-Endpoints nur Admin.
  - Tests: `/app/backend/tests/test_interimio.py`, Report `/app/test_reports/iteration_1.json` (Backend 16/16, Frontend ok).

## Backlog
- P1: Pro-Version (Preis festlegen, Stripe Checkout, Pro-Gating für Learning/Podcast-Vorab, Pro-Badge).
- P1: Manager-eigene Lead-Inbox (Anfragen an mich sehen/beantworten), E-Mail-Benachrichtigung bei neuer Anfrage.
- P2: Podigee RSS-Auto-Import; echte Podigee-URL (User hat noch keine).
- P2: UI-Copy auf Deutsch / i18n; Profilbild-Upload (Object Storage) statt URL.
- P3: PWA/Native Wrapper. Refactoring App.js/server.py in Module.
