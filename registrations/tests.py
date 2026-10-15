from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Registration


User = get_user_model()


class RegistrationDuplicateValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(email="existing@example.com", password="pass123")
        Registration.objects.create(
            user=user,
            full_name="Existing User",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            phone="9876543210",
        )

    def test_availability_rejects_case_insensitive_email_and_phone(self):
        response = self.client.post(
            "/api/registrations/availability/",
            {"email": "EXISTING@EXAMPLE.COM", "phone": "9876543210"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data["errors"]), {"email", "phone"})

    def test_registration_rejects_duplicate_email_and_phone(self):
        response = self.client.post(
            "/api/registrations/",
            {
                "full_name": "Another User",
                "gender": "Male",
                "date_of_birth": "1994-01-01",
                "email": "EXISTING@example.com",
                "password": "pass123",
                "phone": "9876543210",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertIn("phone", response.data)
        self.assertEqual(User.objects.count(), 1)

    def test_new_email_and_phone_are_accepted_and_email_is_normalized(self):
        response = self.client.post(
            "/api/registrations/",
            {
                "full_name": "New User",
                "gender": "Male",
                "date_of_birth": "1994-01-01",
                "email": "  New.User@Example.com ",
                "password": "pass123",
                "phone": " 9123456780 ",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(User.objects.filter(email="new.user@example.com").exists())
        self.assertTrue(Registration.objects.filter(phone="9123456780").exists())

