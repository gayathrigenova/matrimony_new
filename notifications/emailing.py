import logging
import os

from django.conf import settings
from django.core.mail import send_mail


logger = logging.getLogger(__name__)


def send_profile_email(subject, body, recipient):
    if not recipient:
        logger.warning("Profile notification skipped: recipient email is missing.")
        return
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient], fail_silently=False)
    except Exception:
        logger.exception("Profile notification delivery failed.")


def notify_admin_profile_change(registration):
    recipient = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()
    dashboard_url = os.getenv("ADMIN_DASHBOARD_URL", "").rstrip("/")
    link = f"{dashboard_url}/admin/view/{registration.pk}" if dashboard_url else ""
    body = (
        f"{registration.full_name} ({registration.matrimony_id or f'Profile #{registration.pk}'}) "
        "updated their profile and it requires review."
    )
    if link:
        body += f"\nReview: {link}"
    send_profile_email("Matrimony profile update requires review", body, recipient)


def notify_client_approval(registration, updated=False):
    dashboard_url = os.getenv("FRONTEND_URL", "https://matrimony-sepia-phi.vercel.app").rstrip("/")
    subject = (
        "Your Updated Matrimony Profile Has Been Approved"
        if updated else "Your Matrimony Profile Has Been Approved"
    )
    detail = (
        "Your updated details and images have been reviewed and approved. "
        "The latest approved information is now published."
        if updated else
        "Your profile has been approved and published."
    )
    send_profile_email(
        subject,
        f"Hello {registration.full_name},\n\n{detail}\n"
        f"Profile status: PUBLISHED\nView your profile or log in: {dashboard_url}/login",
        registration.user.email,
    )


def notify_client_decision(registration, status_label, message=""):
    text = f"Your Matrimony profile status is now {status_label}."
    if message:
        text += f"\n\nAdmin message: {message}"
    text += "\n\nPlease log in to review your profile: " + os.getenv(
        "FRONTEND_URL", "https://matrimony-sepia-phi.vercel.app"
    ).rstrip("/") + "/login"
    send_profile_email("Update about your Matrimony profile", text, registration.user.email)
