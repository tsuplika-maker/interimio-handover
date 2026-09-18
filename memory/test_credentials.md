# Interimio – Test Credentials

## Admin (seeded from backend/.env on startup)
- Email: admin@interimio.com
- Password: Interimio-Admin-3fb01e39
- Role: admin
- Login: POST /api/auth/login → Bearer token; admin UI at /admin

## Test users
Register via UI (Register → role client/manager). OTP is sent by SendGrid; if delivery fails the code is logged in
`/var/log/supervisor/backend.err.log` as `[DEV OTP] Email code for <email>: 123456`.
Verify: POST /api/auth/verify-otp {user_id, method:"email", code}

## Key endpoints
- POST /api/auth/register, /api/auth/login, /api/auth/verify-otp, GET /api/auth/me
- GET /api/managers, GET /api/managers/{id}, GET/POST /api/managers/me|/api/managers (manager upsert)
- POST /api/leads (verified client)
- POST /api/pro/interest (manager)
- Admin: GET /api/admin/stats, /api/admin/leads, PATCH /api/admin/leads/{id}, GET /api/admin/leads/export,
  GET /api/admin/discount-codes, POST /api/discount-codes, PATCH/DELETE /api/admin/discount-codes/{id}
