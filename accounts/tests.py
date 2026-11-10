from datetime import date
import os
import re
import smtplib
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone

from .models import User
from .password_reset import PasswordResetToken
from django.core import mail
from adminpanel.models import ProfileChange, ProfileVerification
from registrations.models import Registration


class TokenRefreshTests(TestCase):
    def test_login_returns_access_and_refresh_tokens_for_account(self):
        user = User.objects.create_user(
            email="login@example.com",
            password="pass123",
            role=User.Role.ADMIN,
        )

        response = APIClient().post(
            "/api/accounts/login/",
            {"username": user.email, "password": "pass123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["access"])
        self.assertTrue(response.data["refresh"])

    def test_refresh_endpoint_returns_a_new_access_token(self):
        user = User.objects.create_user(email="refresh@example.com", password="pass123")
        refresh = str(RefreshToken.for_user(user))

        response = APIClient().post(
            "/api/accounts/token/refresh/",
            {"refresh": refresh},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["access"])

    def test_refresh_endpoint_rejects_invalid_refresh_token(self):
        response = APIClient().post(
            "/api/accounts/token/refresh/",
            {"refresh": "invalid"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="no-reply@example.com",
)
class PasswordResetTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="reset@example.com",
            password="OriginalPassword#2026",
            full_name="Reset User",
        )
        self.client = APIClient()

    def request_reset(self):
        return self.client.post(
            "/api/accounts/password-reset/",
            {"email": self.user.email},
            format="json",
        )

    def get_reset_link(self):
        response = self.request_reset()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data["message"],
            "If an account exists with this email, a password reset link has been sent.",
        )
        html_body = mail.outbox[-1].alternatives[0][0]
        match = re.search(
            r'href="([^"]+/reset-password/([^/]+)/([^/"?]+))"',
            html_body,
        )
        self.assertIsNotNone(match)
        return match.group(2), match.group(3)

    def test_request_response_does_not_disclose_account_existence(self):
        known_response = self.request_reset()
        unknown_response = self.client.post(
            "/api/accounts/password-reset/",
            {"email": "unknown@example.com"},
            format="json",
        )

        self.assertEqual(known_response.status_code, 200)
        self.assertEqual(unknown_response.status_code, 200)
        self.assertEqual(known_response.data, unknown_response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].from_email, "no-reply@example.com")

    def test_reset_changes_password_and_token_cannot_be_reused(self):
        uid, raw_token = self.get_reset_link()
        stored_token = PasswordResetToken.objects.get(user=self.user)
        self.assertNotEqual(stored_token.token_hash, raw_token)
        self.assertIn("Reset Password", mail.outbox[0].alternatives[0][0])
        self.assertIn(raw_token, mail.outbox[0].body)

        response = self.client.post(
            "/api/accounts/password-reset-confirm/",
            {
                "uid": uid,
                "token": raw_token,
                "new_password": "SecureReset#2026",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("SecureReset#2026"))
        self.assertTrue(stored_token.__class__.objects.get(pk=stored_token.pk).used)

        replay_response = self.client.post(
            "/api/accounts/password-reset-confirm/",
            {
                "uid": uid,
                "token": raw_token,
                "new_password": "AnotherSecure#2026",
            },
            format="json",
        )
        self.assertEqual(replay_response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("SecureReset#2026"))

    def test_expired_reset_link_is_rejected(self):
        uid, raw_token = self.get_reset_link()
        token = PasswordResetToken.objects.get(user=self.user)
        PasswordResetToken.objects.filter(pk=token.pk).update(
            created_at=timezone.now() - timedelta(minutes=31),
        )

        response = self.client.post(
            "/api/accounts/password-reset-confirm/",
            {
                "uid": uid,
                "token": raw_token,
                "new_password": "SecureReset#2026",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "This password reset link is invalid or has expired.")
        token.refresh_from_db()
        self.assertTrue(token.used)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OriginalPassword#2026"))

    def test_invalid_password_does_not_consume_reset_link(self):
        uid, raw_token = self.get_reset_link()

        response = self.client.post(
            "/api/accounts/password-reset-confirm/",
            {
                "uid": uid,
                "token": raw_token,
                "new_password": "123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)
        self.assertIsNotNone(PasswordResetToken.verify(raw_token))

    @patch(
        "accounts.views.EmailMultiAlternatives.send",
        side_effect=smtplib.SMTPException("SMTP delivery failed"),
    )
    def test_email_delivery_failure_invalidates_issued_token(self, _send):
        response = self.request_reset()

        self.assertEqual(response.status_code, 200)
        token = PasswordResetToken.objects.get(user=self.user)
        self.assertTrue(token.used)


class AccountContactNotificationTests(TestCase):
    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_account_contact_update_notifies_registered_user_and_admin(self):
        user = User.objects.create_user(
            email="account@example.com",
            password="pass123",
            full_name="Account User",
            phone="9000000000",
        )
        registration = Registration.objects.create(
            user=user,
            full_name="Account User",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            phone="9000000000",
        )
        client = APIClient()
        client.force_authenticate(user)

        with patch.dict(
            os.environ,
            {
                "ADMIN_NOTIFICATION_EMAIL": "admin@example.com",
                "ADMIN_DASHBOARD_URL": "https://matrimony.example.com",
            },
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = client.patch(
                    "/api/accounts/update-account/",
                    {"email": "new-account@example.com", "phone": "9111111111"},
                    format="json",
                )

        self.assertEqual(response.status_code, 200, response.data)
        registration.refresh_from_db()
        self.assertEqual(registration.phone, "9111111111")
        self.assertEqual(user.email, "new-account@example.com")
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(mail.outbox[0].to, ["new-account@example.com"])
        self.assertIn("Email, Phone", mail.outbox[0].body)
        self.assertEqual(mail.outbox[1].to, ["admin@example.com"])

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_published_account_contact_change_is_staged_for_admin_review(self):
        user = User.objects.create_user(
            email="published@example.com",
            password="pass123",
            full_name="Published User",
            phone="9000000000",
        )
        registration = Registration.objects.create(
            user=user,
            full_name="Published User",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            phone="9000000000",
            status=Registration.Status.PUBLISHED,
        )
        client = APIClient()
        client.force_authenticate(user)

        with patch.dict(
            os.environ,
            {
                "ADMIN_NOTIFICATION_EMAIL": "admin@example.com",
                "ADMIN_DASHBOARD_URL": "https://matrimony.example.com",
            },
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = client.patch(
                    "/api/accounts/update-account/",
                    {"email": "new-published@example.com", "phone": "9222222222"},
                    format="json",
                )

        self.assertEqual(response.status_code, 200, response.data)
        registration.refresh_from_db()
        self.assertEqual(registration.phone, "9000000000")
        change = ProfileChange.objects.get(
            registration=registration,
            status=ProfileChange.Status.PENDING_REVIEW,
        )
        self.assertEqual(change.pending_data["phone"], "9222222222")
        self.assertEqual(
            ProfileVerification.objects.get(client=user).status,
            ProfileVerification.Status.UNDER_REVIEW,
        )
        self.assertEqual(len(mail.outbox), 2)
