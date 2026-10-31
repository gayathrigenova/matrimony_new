import logging
import re
import smtplib

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


def send_mobile_otp(phone, otp):
    if settings.MOBILE_OTP_MODE != "console":
        logger.error(
            "Mobile verification is unavailable because SMS delivery is not configured."
        )
        raise VerificationDeliveryError(
            "Mobile verification is unavailable because SMS delivery is not configured."
        )
    logger.warning(
        "Development mobile verification code for phone ending in %s: %s",
        phone[-4:],
        otp,
    )
    return "development_console"
