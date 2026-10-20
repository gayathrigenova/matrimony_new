from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


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
