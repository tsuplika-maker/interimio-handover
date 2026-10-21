"""Passwort-Hashing, CSRF-Schutz und Rollenprüfung."""
import hashlib
import hmac
import secrets

from fastapi import HTTPException, Request

ROLES = {
    "admin": "Administrator",
    "recruiter": "Recruiter",
    "viewer": "Fachbereich (lesen & kommentieren)",
}

PLANS = {
    "trial": {"name": "Testphase (14 Tage)", "jobs": 10, "users": 5, "price": 0},
    "starter": {"name": "Starter", "jobs": 3, "users": 2, "price": 79},
    "business": {"name": "Business", "jobs": 15, "users": 10, "price": 199},
    "enterprise": {"name": "Enterprise", "jobs": 10_000, "users": 10_000, "price": 499},
}

_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
    return hmac.compare_digest(check, digest)


def csrf_token(request: Request) -> str:
    token = request.session.get("csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        request.session["csrf"] = token
    return token


def check_csrf(request: Request, token: str | None) -> None:
    expected = request.session.get("csrf")
    if not expected or not token or not hmac.compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="Ungültiges Sicherheits-Token. Bitte Seite neu laden.")


def require_role(user, *roles: str) -> None:
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="Dafür fehlen Ihnen die Berechtigungen.")
