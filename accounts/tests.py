from datetime import date
import os
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
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
