"""E-Mail-Versand per SMTP. Ohne SMTP_HOST werden Mails nur protokolliert."""
import logging
import os
import smtplib
from email.message import EmailMessage

from .db import now

log = logging.getLogger("hireflow.mail")


def render(text: str, values: dict) -> str:
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", str(value))
    return text


def _smtp_send(to: str, subject: str, body: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "465"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    msg = EmailMessage()
    msg["From"] = f'{os.environ.get("SENDER_NAME", "Recruiting")} <{os.environ.get("SENDER_EMAIL", user)}>'
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=15)
    else:
        server = smtplib.SMTP(host, port, timeout=15)
        server.starttls()
    with server:
        if user:
            server.login(user, password)
        server.send_message(msg)


def send(conn, org_id: int, application_id, to: str, subject: str, body: str) -> str:
    if os.environ.get("SMTP_HOST"):
        try:
            _smtp_send(to, subject, body)
            status = "gesendet"
        except Exception as exc:  # Versandfehler dürfen den Workflow nicht abbrechen
            log.exception("Mailversand an %s fehlgeschlagen", to)
            status = f"Fehler: {exc}"
    else:
        log.info("SMTP nicht konfiguriert – Mail an %s: %s", to, subject)
        status = "protokolliert (kein SMTP)"
    conn.execute(
        "INSERT INTO emails_sent (org_id, application_id, to_email, subject, body, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (org_id, application_id, to, subject, body, status, now()),
    )
    return status
