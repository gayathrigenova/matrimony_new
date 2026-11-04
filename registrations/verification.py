import logging
import base64
import json
import re
import smtplib
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import send_mail


logger = logging.getLogger(__name__)


class VerificationDeliveryError(Exception):
    pass


def _safe_email_error(exc, email, otp):
    response = getattr(exc, "smtp_error", None)
    if isinstance(response, bytes):
        response = response.decode("utf-8", errors="replace")
    detail = str(response if response is not None else exc)
    for secret in (
        settings.EMAIL_HOST_PASSWORD,
        settings.EMAIL_HOST_USER,
        email,
        otp,
    ):
        if secret:
            detail = detail.replace(secret, "[redacted]")
    detail = re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "[redacted email]",
        detail,
    )
    detail = re.sub(r"\b\d{6}\b", "[redacted code]", detail)
    return detail[:500]


def send_email_otp(email, otp):
    if settings.IS_RAILWAY and not settings.EMAIL_BACKEND.endswith(
        "smtp.EmailBackend"
    ):
        raise VerificationDeliveryError(
            "Railway email verification requires Django's SMTP email backend."
        )

    missing_settings = []
    if settings.EMAIL_BACKEND.endswith("smtp.EmailBackend"):
        missing_settings = [
            name
            for name, value in (
                ("EMAIL_HOST", settings.EMAIL_HOST),
                ("EMAIL_HOST_USER", settings.EMAIL_HOST_USER),
                ("EMAIL_HOST_PASSWORD", settings.EMAIL_HOST_PASSWORD),
                ("DEFAULT_FROM_EMAIL", settings.DEFAULT_FROM_EMAIL),
            )
            if not value.strip()
        ]
        if settings.DEFAULT_FROM_EMAIL.lower().endswith("@localhost"):
            missing_settings.append("DEFAULT_FROM_EMAIL (use the verified website sender)")
    if missing_settings:
        raise VerificationDeliveryError(
            "Email delivery is not configured. Set these Railway variables: "
            + ", ".join(missing_settings)
            + "."
        )

    expiry_minutes = max(1, settings.OTP_EXPIRY_SECONDS // 60)
    try:
        sent = send_mail(
            "Your Matrimony verification code",
            (
                f"Your email verification code is {otp}. "
                f"It expires in {expiry_minutes} minutes."
            ),
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
    except (
        OSError,
        smtplib.SMTPException,
        ImproperlyConfigured,
        ValueError,
    ) as exc:
        logger.error(
            "Email OTP delivery failed: exception=%s smtp_code=%s detail=%s",
            type(exc).__name__,
            getattr(exc, "smtp_code", None),
            _safe_email_error(exc, email, otp),
        )
        raise VerificationDeliveryError(
            "The email verification code could not be sent. Please try again."
        ) from exc
    if sent != 1:
        logger.error("Email OTP was not accepted by the configured email backend.")
        raise VerificationDeliveryError(
            "The email verification code could not be sent. Please try again."
        )
    return (
        "console"
        if settings.EMAIL_BACKEND.endswith("console.EmailBackend")
        else "sent"
    )


def _provider_error(provider, exc):
    logger.error(
        "Mobile OTP delivery failed: provider=%s exception=%s status=%s",
        provider,
        type(exc).__name__,
        getattr(exc, "code", None),
    )
    raise VerificationDeliveryError(
        "The mobile verification code could not be sent. Check the SMS provider "
        "configuration and try again."
    ) from exc


def _send_http_sms(phone, otp):
    missing = [
        name
        for name, value in (
            ("SMS_API_URL", settings.SMS_API_URL),
            ("SMS_API_KEY", settings.SMS_API_KEY),
            ("SMS_API_KEY_HEADER", settings.SMS_API_KEY_HEADER),
        )
        if not value
    ]
    if missing:
        raise VerificationDeliveryError(
            "SMS delivery is not configured. Set these Railway variables: "
            + ", ".join(missing)
            + "."
        )
    if settings.IS_RAILWAY and not settings.SMS_API_URL.startswith("https://"):
        raise VerificationDeliveryError(
            "SMS_API_URL must use HTTPS on Railway."
        )

    message = (
        f"Your Matrimony mobile verification code is {otp}. "
        f"It expires in {max(1, settings.OTP_EXPIRY_SECONDS // 60)} minutes."
    )
    payload = {"to": phone, "message": message}
    if settings.SMS_SENDER_ID:
        payload["sender"] = settings.SMS_SENDER_ID
    credentials = (
        f"{settings.SMS_API_KEY_PREFIX} {settings.SMS_API_KEY}".strip()
    )
    headers = {"Content-Type": "application/json"}
    headers[settings.SMS_API_KEY_HEADER] = credentials
    request = Request(
        settings.SMS_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.SMS_TIMEOUT) as response:
            if not 200 <= response.status < 300:
                raise OSError(f"Unexpected provider status {response.status}")
    except (HTTPError, URLError, OSError, ValueError) as exc:
        _provider_error("http", exc)
    return "sent"


def _twilio_phone(phone):
    digits = re.sub(r"\D", "", phone)
    if phone.strip().startswith("+"):
        return f"+{digits}"
    country_code = re.sub(r"\D", "", settings.SMS_DEFAULT_COUNTRY_CODE)
    if len(digits) == 10 and country_code:
        return f"+{country_code}{digits}"
    return f"+{digits}"


def _send_twilio_sms(phone, otp):
    missing = [
        name
        for name, value in (
            ("TWILIO_ACCOUNT_SID", settings.TWILIO_ACCOUNT_SID),
            ("TWILIO_AUTH_TOKEN", settings.TWILIO_AUTH_TOKEN),
            ("TWILIO_FROM_NUMBER", settings.TWILIO_FROM_NUMBER),
        )
        if not value
    ]
    if missing:
        raise VerificationDeliveryError(
            "Twilio SMS delivery is not configured. Set these Railway "
            "variables: " + ", ".join(missing) + "."
        )

    message = (
        f"Your Matrimony mobile verification code is {otp}. "
        f"It expires in {max(1, settings.OTP_EXPIRY_SECONDS // 60)} minutes."
    )
    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    )
    auth = base64.b64encode(
        f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}".encode()
    ).decode("ascii")
    request = Request(
        url,
        data=urlencode({
            "To": _twilio_phone(phone),
            "From": settings.TWILIO_FROM_NUMBER,
            "Body": message,
        }).encode("ascii"),
        headers={"Authorization": f"Basic {auth}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.SMS_TIMEOUT) as response:
            if not 200 <= response.status < 300:
                raise OSError(f"Unexpected provider status {response.status}")
    except (HTTPError, URLError, OSError, ValueError) as exc:
        _provider_error("twilio", exc)
    return "sent"


def send_mobile_otp(phone, otp):
    if settings.SMS_PROVIDER == "http":
        return _send_http_sms(phone, otp)
    if settings.SMS_PROVIDER == "twilio":
        return _send_twilio_sms(phone, otp)
    if (
        settings.DEBUG
        and settings.MOBILE_OTP_MODE == "console"
        and settings.SMS_PROVIDER in ("", "disabled")
    ):
        logger.warning(
            "Development mobile verification code for phone ending in %s: %s",
            phone[-4:],
            otp,
        )
        return "development_console"

    provider_note = (
        "The configured SMS provider is unavailable."
        if settings.SMS_PROVIDER == "disabled"
        else "No SMS provider is configured."
    )
    logger.error("Mobile verification unavailable: %s", provider_note)
    raise VerificationDeliveryError(
        f"Real mobile SMS delivery is unavailable. {provider_note} Configure "
        "SMS_PROVIDER and its required credentials."
    )
