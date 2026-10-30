import logging
import os
import smtplib

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import send_mail
from django.utils import timezone


logger = logging.getLogger(__name__)


def send_profile_email(subject, body, recipient):
    if not recipient or not recipient.strip():
        logger.warning("Profile notification skipped: recipient email is missing.")
        return False
    try:
        sent_count = send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [recipient.strip()],
            fail_silently=False,
        )
    except (
        OSError,
        smtplib.SMTPException,
        ImproperlyConfigured,
        ValueError,
    ):
        logger.exception("Profile notification delivery failed.")
        return False
    if sent_count != 1:
        logger.error("Profile notification was not accepted by the configured email backend.")
        return False
    return True


def _profile_label(registration):
    return registration.matrimony_id or f"Profile #{registration.pk}"


def _format_changed_fields(changed_fields):
    if not changed_fields:
        return "Profile details were updated."
    labels = []
    for item in changed_fields:
        if not isinstance(item, dict):
            continue
        field = item.get("field_name", "profile")
        label = field.replace("_", " ").strip().title()
        if item.get("slot_index"):
            label += f" (photo slot {item['slot_index']})"
        labels.append(label)
    return ", ".join(dict.fromkeys(labels)) or "Profile details were updated."


def notify_registration_completed(registration):
    registered_date = timezone.localtime(registration.created_at).strftime("%B %d, %Y")
    send_profile_email(
        "Your Matrimony registration is complete",
        (
            f"Hello {registration.full_name},\n\n"
            "Your registration has been received successfully.\n"
            f"Registration date: {registered_date}\n"
            f"Profile ID: {_profile_label(registration)}\n\n"
            "Your profile is pending admin verification. We will notify you "
            "when it has been reviewed."
        ),
        registration.user.email,
    )


def notify_admin_new_registration(registration):
    recipient = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()
    dashboard_url = os.getenv("ADMIN_DASHBOARD_URL", "").rstrip("/")
    link = f"{dashboard_url}/admin/view/{registration.pk}" if dashboard_url else ""
    body = (
        f"New registration ready for admin review.\n"
        f"Name: {registration.full_name}\n"
        f"Profile ID: {_profile_label(registration)}\n"
        f"Registration date: {timezone.localtime(registration.created_at).strftime('%B %d, %Y')}\n"
        "Status: PENDING"
    )
    if link:
        body += f"\nReview: {link}"
    send_profile_email("New Matrimony registration requires review", body, recipient)


def notify_admin_profile_change(registration, changed_fields=None):
    recipient = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()
    dashboard_url = os.getenv("ADMIN_DASHBOARD_URL", "").rstrip("/")
    link = f"{dashboard_url}/admin/view/{registration.pk}" if dashboard_url else ""
    if changed_fields is None:
        change = registration.profile_changes.filter(
            status="PENDING_REVIEW"
        ).first()
        changed_fields = change.changed_fields if change else []
    review_context = (
        "previously approved profile submitted for re-approval"
        if registration.status in ("APPROVED", "PUBLISHED")
        else "profile update ready for admin review"
    )
    body = (
        f"{registration.full_name} ({_profile_label(registration)}) "
        f"submitted a {review_context}.\n"
        f"Update details: {_format_changed_fields(changed_fields)}"
    )
    if link:
        body += f"\nReview: {link}"
    send_profile_email("Matrimony profile update requires review", body, recipient)


def notify_client_profile_update(registration, changed_fields):
    dashboard_url = os.getenv(
        "FRONTEND_URL", "https://matrimony-sepia-phi.vercel.app"
    ).rstrip("/")
    send_profile_email(
        "Your Matrimony profile has been updated",
        (
            f"Hello {registration.full_name},\n\n"
            "Your profile update was saved successfully.\n"
            f"Update details: {_format_changed_fields(changed_fields)}\n\n"
            "The update may require admin re-approval before it appears on "
            "your published profile. You can review your profile here: "
            f"{dashboard_url}/login"
        ),
        registration.user.email,
    )


def notify_profile_update(registration, changed_fields):
    notify_client_profile_update(registration, changed_fields)
    notify_admin_profile_change(registration, changed_fields)


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
