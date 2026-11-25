import logging
import base64
import hashlib
import json
import re
import smtplib
from datetime import datetime, timezone as datetime_timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from anymail.exceptions import AnymailError
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import send_mail
from notifications.emailing import safe_email_error


logger = logging.getLogger(__name__)


class VerificationDeliveryError(Exception):
    pass


def send_email_otp(email, otp):
    missing_settings = []
    if settings.EMAIL_BACKEND.endswith("resend.EmailBackend"):
        if not settings.RESEND_API_KEY:
            missing_settings.append("RESEND_API_KEY")
        if not settings.DEFAULT_FROM_EMAIL.strip():
            missing_settings.append("DEFAULT_FROM_EMAIL")
    elif settings.EMAIL_BACKEND.endswith("smtp.EmailBackend"):
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
    elif not settings.DEFAULT_FROM_EMAIL.strip():
        missing_settings.append("DEFAULT_FROM_EMAIL")
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
        AnymailError,
        ImproperlyConfigured,
        ValueError,
    ) as exc:
        logger.error(
            "Email OTP delivery failed: exception=%s smtp_code=%s "
            "http_status=%s detail=%s",
            type(exc).__name__,
            getattr(exc, "smtp_code", None),
            getattr(exc, "status_code", None),
            safe_email_error(exc, (email, otp)),
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


def _send_http_sms(phone, message):
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


def _genova_auth_signature(access_token, access_token_key, expire):
    time_key = hashlib.md5(
        ("send-sms" + "sms@rits-v1.0" + str(expire)).encode("utf-8")
    ).hexdigest()
    time_access_token_key = hashlib.md5(
        f"{access_token}{time_key}".encode("utf-8")
    ).hexdigest()
    return hashlib.md5(
        f"{time_access_token_key}{access_token_key}".encode("utf-8")
    ).hexdigest()


def _send_genova_registration_otp(phone, otp):
    access_token = settings.GENOVA_SMS_ACCESS_TOKEN
    access_token_key = settings.GENOVA_SMS_ACCESS_TOKEN_KEY
    if not access_token or not access_token_key:
        missing = []
        if not access_token:
            missing.append("SMS_ACCESS_TOKEN")
        if not access_token_key:
            missing.append("SMS_ACCESS_TOKEN_KEY")
        raise VerificationDeliveryError(
            "SMS delivery is not configured. Set these Railway variables: "
            + ", ".join(missing)
            + "."
        )

    expire = int(datetime.now(datetime_timezone.utc).timestamp())
    signature = _genova_auth_signature(access_token, access_token_key, expire)
    message = (
        "Your Keralakkara Matrimony registration OTP is "
        f"{otp}. Valid for 10 minutes. Do not share this OTP with anyone."
    )
    payload = {
        "RequestFor": "send-sms",
        "accessToken": access_token,
        "expire": expire,
        "authSignature": signature,
        "route": settings.GENOVA_SMS_ROUTE,
        "smsHeader": settings.GENOVA_SMS_HEADER,
        "entityId": settings.GENOVA_SMS_ENTITY_ID,
        "templateId": settings.GENOVA_OTP_TEMPLATE_ID,
        "contentType": settings.GENOVA_SMS_CONTENT_TYPE,
        "recipients": phone,
        "message": message,
    }
    request = Request(
        settings.GENOVA_SMS_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.SMS_TIMEOUT) as response:
            if not 200 <= response.status < 300:
                raise OSError(f"Unexpected provider status {response.status}")
    except (HTTPError, URLError, OSError, ValueError) as exc:
        _provider_error("genova", exc)
    return "sent"


def _twilio_phone(phone):
    digits = re.sub(r"\D", "", phone)
    if phone.strip().startswith("+"):
        return f"+{digits}"
    country_code = re.sub(r"\D", "", settings.SMS_DEFAULT_COUNTRY_CODE)
    if len(digits) == 10 and country_code:
        return f"+{country_code}{digits}"
    return f"+{digits}"


def _send_twilio_sms(phone, message):
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
    return _send_genova_registration_otp(phone, otp)


def send_interest_notification(phone):
    """Send a privacy-safe notification for a newly created profile interest."""
    digits = re.sub(r"\D", "", phone or "")
    country_code = re.sub(r"\D", "", settings.SMS_DEFAULT_COUNTRY_CODE)
    if len(digits) == 10 and country_code:
        digits = country_code + digits
    if not 8 <= len(digits) <= 15 or digits.startswith("0"):
        logger.warning("Interest SMS skipped because the recipient number is invalid.")
        return False

    message = (
        "Hello, someone is interested in your profile on Kerala Karam Matrimony. "
        "Login to your account to view the interest."
    )
    if settings.SMS_PROVIDER == "http":
        _send_http_sms(f"+{digits}", message)
    elif settings.SMS_PROVIDER == "twilio":
        _send_twilio_sms(f"+{digits}", message)
    else:
        logger.info("Interest SMS skipped because no SMS provider is enabled.")
        return False
    return True
