import base64
import logging
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
        logger.exception("Email OTP delivery failed.")
        raise VerificationDeliveryError(
            "The email verification code could not be sent. Please try again."
        ) from exc
    if sent != 1:
        logger.error("Email OTP was not accepted by the configured email backend.")
        raise VerificationDeliveryError(
            "The email verification code could not be sent. Please try again."
        )


def _format_phone_number(phone):
    value = re.sub(r"[^\d+]", "", phone.strip())
    if not value.startswith("+"):
        country_code = settings.SMS_DEFAULT_COUNTRY_CODE.strip()
        country_code = country_code if country_code.startswith("+") else f"+{country_code}"
        value = f"{country_code}{value.lstrip('0')}"
    if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
        raise VerificationDeliveryError(
            "Enter a valid mobile number with its country code."
        )
    return value


def send_mobile_otp(phone, otp):
    if settings.SMS_PROVIDER.lower() != "twilio":
        raise VerificationDeliveryError(
            "SMS delivery is not configured. Set SMS_PROVIDER=twilio and add "
            "the Twilio credentials in Railway."
        )
    account_sid = settings.TWILIO_ACCOUNT_SID.strip()
    auth_token = settings.TWILIO_AUTH_TOKEN.strip()
    from_number = settings.TWILIO_FROM_NUMBER.strip()
    messaging_service_sid = settings.TWILIO_MESSAGING_SERVICE_SID.strip()
    if not account_sid or not auth_token or not (from_number or messaging_service_sid):
        missing_settings = []
        if not account_sid:
            missing_settings.append("TWILIO_ACCOUNT_SID")
        if not auth_token:
            missing_settings.append("TWILIO_AUTH_TOKEN")
        if not (from_number or messaging_service_sid):
            missing_settings.append(
                "TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID"
            )
        raise VerificationDeliveryError(
            "SMS delivery is not configured. Set "
            + ", ".join(missing_settings)
            + " in Railway."
        )

    expiry_minutes = max(1, settings.OTP_EXPIRY_SECONDS // 60)
    payload = {
        "To": _format_phone_number(phone),
        "Body": (
            f"Your Matrimony verification code is {otp}. "
            f"It expires in {expiry_minutes} minutes."
        ),
    }
    if messaging_service_sid:
        payload["MessagingServiceSid"] = messaging_service_sid
    else:
        payload["From"] = from_number

    credentials = base64.b64encode(
        f"{account_sid}:{auth_token}".encode("utf-8")
    ).decode("ascii")
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
        data=urlencode(payload).encode("ascii"),
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            if not 200 <= response.status < 300:
                raise VerificationDeliveryError(
                    "The mobile verification code could not be sent. Please try again."
                )
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        logger.exception("Mobile OTP delivery failed.")
        raise VerificationDeliveryError(
            "The mobile verification code could not be sent. Please try again."
        ) from exc
