SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL") or SMTP_USER or "noreply@example.com"
SENDER_NAME = os.environ.get("SENDER_NAME", "Interimio")
SMTP_CONFIGURED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)
EMAIL_DEV_MODE = "true" if not SMTP_CONFIGURED else os.environ.get("EMAIL_DEV_MODE", "false")

def send_email(to_email: str, subject: str, html: str) -> bool:
    if not SMTP_CONFIGURED:
        return False
    msg = EmailMessage()
    msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(re.sub(r"<[^>]+>", "", html))
    msg.add_alternative(html, subtype="html")
    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        logger.info(f"SMTP mail sent to {to_email}")
        return True
    except Exception as e:  # pragma: no cover
        logger.error(f"SMTP send failed: {e}")
        return False


async def send_email_async(to_email: str, subject: str, html: str) -> bool:
    return await asyncio.to_thread(send_email, to_email, subject, html)


async def send_email_code(to_email: str, code: str) -> bool:
    """Send OTP code via SMTP if configured. Returns True if sent."""
    return await send_email_async(to_email, "Your Interimio verification code", f"""
                <div style='font-family: Montserrat, Arial; line-height:1.6'>
                  <h2 style='margin:0 0 8px'>Verify your email</h2>
                  <p>Your one-time verification code is:</p>
                  <div style='font-size:28px;font-weight:700;background:#0b6bcb;color:#fff;padding:12px 16px;border-radius:8px;display:inline-block;letter-spacing:3px'>{code}</div>
                  <p style='margin-top:12px'>This code expires in 10 minutes. If you didn’t request it, you can ignore this message.</p>
                </div>
            """)


