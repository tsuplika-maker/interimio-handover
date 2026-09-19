# Übergabe-Paket: interimio-preview → interim-connect-3

Ziel: Die Features, die **nur in diesem Projekt** existieren, in das Hauptprojekt **interim-connect-3** übernehmen.
Beide Projekte basieren auf demselben Stack (React + FastAPI + MongoDB, `server.py` als Monolith, JWT via `get_current_user`,
Nutzer mit `id` (UUID) / `email` / `role` / `email_verified`) – der Code ist daher weitgehend 1:1 übertragbar.

> Für den Agenten im Projekt interim-connect-3: Dieses Repo enthält den lauffähigen Referenzstand.
> Vollständige Quellen: `/backend/server.py`, `/frontend/src/**`, `/mobile/**`. Die Dateien unter `/handover/` sind die
> herausgelösten, relevanten Abschnitte. Tests: `/backend/tests/test_messaging.py`, `/backend/tests/test_interimio.py`.

---

## 0. Produktentscheidungen, die im Zielprojekt umzusetzen sind

1. **Manager sind kostenlos – keine Mitgliedsgebühr.** Die Preise €1.999/Jahr bzw. €199/Monat, die Gratis-Aktion („bis 30.09.2026 …“)
   und die Stripe-Checkout-Buttons für Manager entfallen in UI (Pricing-Card, Onboarding, Hero, AGB §-Text) und dürfen nicht mehr
   beworben werden. Stattdessen: „Für Interim Manager – kostenlos“ + Teaser **„Interimio Pro – bald verfügbar“** mit Warteliste
   (siehe `handover/backend/pro_interest.py` und `ManagerJoinCard` in `/frontend/src/App.js`). Rabattcodes bleiben für Pro erhalten.
2. Podcast-Bereich heißt weiterhin **„Podcast“** (nicht „Podiac“).
3. SMS-OTP bleibt deaktiviert.
4. Sprache: Deutsch Standard, EN-Umschalter (bereits im Zielprojekt vorhanden) – neue UI-Texte aus diesem Paket sind Englisch und
   müssen in `i18n.js` (de/en) übersetzt werden.

## 1. E-Mail-Versand über one.com (SMTP) statt SendGrid  — `handover/backend/smtp_mail.py`

SendGrid-Trial ist abgelaufen („Maximum credits exceeded“). Ersetzen durch stdlib `smtplib` (kein Paket nötig).

- Env (Backend):
  ```
  SMTP_HOST="send.one.com"
  SMTP_PORT="465"
  SMTP_USER="noreply@interimio.eu"
  SMTP_PASSWORD="<Postfach-Passwort – beim Auftraggeber erfragen, nicht ins Repo>"
  SENDER_EMAIL="noreply@interimio.eu"
  SENDER_NAME="Interimio"
  FRONTEND_URL="https://interimio.eu"
  ```
- `send_email(to, subject, html)` (sync) + `send_email_async` (`asyncio.to_thread`) + `send_email_code` (OTP-Mail).
  Alle Aufrufer `await`-en. Fallback bei Fehler: OTP ins Log (`[DEV OTP] …`).
- Test-Endpoint für Admin: `POST /api/admin/test-email {to}`.
- `sendgrid` aus requirements entfernen.

## 2. Messaging (Chat) — `handover/backend/messaging.py`, `lead_conversation_hook.py`, `frontend/pages/MessagesPage.jsx`

Regeln (vom Auftraggeber festgelegt):
- **Client ↔ Manager pro Anfrage** (Conversation `type="lead"`, wird automatisch in `POST /api/leads` erzeugt; Lead-Nachricht = erste Chat-Nachricht; `Lead.conversation_id` zurückgeben).
- **Jeder ↔ Orga** (`type="support"`, `POST /api/conversations/support`, idempotent). **Kein Manager ↔ Manager.**
- Admin sieht/schreibt in allen Konversationen (`can_access`).
- **Kontaktdaten-Schutz:** In Lead-Konversationen werden E-Mail/Telefon/URLs für Nicht-Admins zu `[hidden until release]`
  (`redact_contacts`, `CONTACT_PATTERNS`), bis Admin `PATCH /api/conversations/{id}/release {released:true}` setzt.
- Ungelesen-Zähler pro Nutzer (`unread.{user_id}`) + `admin_unread`; `GET /api/conversations/unread-count`.
- E-Mail-Benachrichtigung an Gegenseite + Admins bei neuer Nachricht (`notify_participants`, 10-min-Throttle pro Empfänger, Link `FRONTEND_URL/messages?c=<id>`).
- Collections: `conversations`, `messages` (Indizes: `participant_ids`, `last_message_at`, `(conversation_id, created_at)`).

Endpunkte: `GET /api/conversations`, `GET /api/conversations/unread-count`, `POST /api/conversations/support`,
`GET /api/conversations/{id}`, `GET/POST /api/conversations/{id}/messages`, `PATCH /api/conversations/{id}/release` (admin).

Frontend:
- `pages/MessagesPage.jsx` (Liste + Thread, Polling 15 s / 5 s, Release-Toggle für Admin, Mobile: Liste→Thread mit Zurück).
- Header: `UnreadBadge` (siehe `/frontend/src/App.js`, Link `/messages` + Zähler, Polling 15 s).
- `RequestDialog.jsx`: Toast nach Anfrage mit Aktion „Chat öffnen“ (`/messages?c=<conversation_id>`).
- Admin-Lead-Inbox: Link „Open chat“ pro Lead (`admin/AdminLeads.jsx`).
- Tests: `backend/tests/test_messaging.py` (16 Fälle) – ins Zielprojekt kopieren und anpassen.

## 3. Manager-Detailseiten & Profil — `handover/backend/manager_profile_fields.py`, `frontend/pages/ManagerDetailPage.jsx`, `ManagerProfilePage.jsx`

- Zusätzliche Manager-Felder: `industries[]`, `languages[]`, `years_experience`, `linkedin_url`, `highlights[]`, `about`, `user_id`.
- `POST /api/managers` = Upsert per `user_id` (Manager pflegt genau ein Profil), `GET /api/managers/me`, `GET /api/managers/{id}`.
- Detailseite `/managers/:id`: Hero, Track Record, Branchen/Sprachen/Verfügbarkeit/LinkedIn, Gebührenrechner (20 %) + Anfrage-CTA.
  Im Zielprojekt existiert bereits `PublicManagerProfile` – Inhalte/Felder zusammenführen, Verzeichnis bleibt dort member-only.
- Profilseite `/profile` (Manager legt Profil kostenlos an/bearbeitet) – ggf. in das vorhandene Manager-Dashboard integrieren.

## 4. Admin-Erweiterungen — `handover/backend/admin_leads_codes_stats.py`, `frontend/admin/*`

- Leads: `status` (new/contacted/qualified/won/lost), `manager_name`, `client_user_id`; `GET /api/admin/leads?status&q`,
  `PATCH /api/admin/leads/{id}`, `GET /api/admin/leads/export` (CSV). Frontend `AdminLeads.jsx`.
- Rabattcodes: `GET /api/admin/discount-codes` (mit `uses` aus `discount_redemptions`), `PATCH/DELETE /api/admin/discount-codes/{id}`,
  Redemptions-Liste. `POST /api/discount-codes` nur Admin, Code wird upper-cased. Frontend `AdminDiscountCodes.jsx`.
- `GET /api/admin/stats` (Leads offen, Gebühren-Summe, Profile, Pro-Warteliste, aktive Codes).
- Seeds (`/managers/seed`, `/discount-codes/seed`) nur Admin.
- `require_admin`-Dependency + idempotentes Admin-Seeding aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` (`admin_seed_and_require_admin.py`) –
  im Zielprojekt existiert bereits eine Admin-Rolle; nur übernehmen, falls dort kein Seeding vorhanden.

## 5. Pro-Warteliste — `handover/backend/pro_interest.py`

`POST /api/pro/interest {discount_code?}` (Manager) → `pro_interest` (upsert) + `discount_redemptions` bei gültigem Code.
UI: `ManagerJoinCard` in `/frontend/src/App.js` (Free-Card + dunkle Pro-Card mit Benefits, Code-Feld, „Notify me“).

## 6. PWA + native App (Capacitor) — `/frontend/public/*`, `/mobile/**`

- PWA: `manifest.json`, Icons `icon-192/512/180.png`, Apple-Meta-Tags in `index.html` (`viewport-fit=cover`, `apple-mobile-web-app-*`).
  **Im Zielprojekt das vorhandene Logo/Favicon (`interimio-logo.jpeg`, `favicon-*.png`, `logo192/512.png`) beibehalten** – nur Manifest-Felder/Meta-Tags ergänzen.
- `/mobile`: eigenes `package.json` (Capacitor 7), `capacitor.config.json` (appId `com.interimio.app`, webDir `../frontend/build`),
  generierte `ios/` + `android/` Projekte, `assets/` (Icon/Splash-Quellen), `README.md` mit Store-Anleitung.
  Ordner 1:1 kopieren; danach `cd mobile && yarn install && yarn build:web && npx cap sync`.
- Offen: Push-Notifications, Konto-Löschung (`DELETE /api/auth/me`, App-Store-Pflicht).

## 7. Kleinere Fixes, die auch im Zielprojekt geprüft werden sollten

- `verify_otp`: naive/aware-Datetime-Vergleich (`datetime.utcnow()` vs. aware `expires_at`) → 500. Überall `datetime.now(timezone.utc)`.
- `useAuth`: Token in `me()` frisch aus `localStorage` lesen, sonst aktualisiert sich der Header nach Login erst nach Reload.
- `PodcastEpisode.podigee_iframe_url` optional (Alt-Datensätze ohne Feld → 500).
- JWT `exp` mit aware datetime erzeugen.

## 8. Empfohlene Reihenfolge im Zielprojekt

1. SMTP-Versand (blockiert sonst alle Registrierungen)  2. Pricing auf „kostenlos + Pro-Teaser“ umstellen  3. Messaging
4. Admin-Lead-Inbox/CSV + Codes  5. Manager-Detailfelder  6. PWA-Meta + `/mobile`  7. Übersetzungen (i18n de/en) für alle neuen Texte

## 9. Zugangsdaten / Umgebung dieses Referenzprojekts

- Admin: `admin@interimio.com` / `Interimio-Admin-3fb01e39` (Seed aus `.env`).
- Test-Reports: `/test_reports/iteration_1.json`, `/test_reports/iteration_2.json`.
