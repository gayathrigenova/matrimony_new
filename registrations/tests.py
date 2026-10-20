from datetime import date
from io import BytesIO
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from adminpanel.models import ProfileChange

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

    def test_profile_and_gallery_apis_report_missing_registration(self):
        user_without_profile = User.objects.create_user(
            email="no-profile@example.com",
            password="pass123",
        )
        self.client.force_authenticate(user_without_profile)

        profile_response = self.client.get("/api/registrations/my-profile/")
        gallery_response = self.client.get("/api/registrations/photos/")

        self.assertEqual(profile_response.status_code, 404)
        self.assertIn("not found", profile_response.data["detail"].lower())
        self.assertEqual(gallery_response.status_code, 404)
        self.assertIn("not found", gallery_response.data["detail"].lower())

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


class AuthenticatedProfileApiTests(TestCase):
    def setUp(self):
        self.media_dir = tempfile.TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_override.enable()
        self.user = User.objects.create_user(
            email="api-admin@example.com",
            password="pass123",
            role=User.Role.ADMIN,
        )
        self.registration = Registration.objects.create(
            user=self.user,
            full_name="API Test User",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            about="Before partial update",
        )
        self.client = APIClient()

    def tearDown(self):
        self.media_override.disable()
        self.media_dir.cleanup()

    def test_login_authenticated_profile_get_partial_patch_and_image_upload(self):
        login = self.client.post(
            "/api/accounts/login/",
            {"username": self.user.email, "password": "pass123"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        profile = self.client.get("/api/registrations/my-profile/")
        self.assertEqual(profile.status_code, 200, profile.data)
        self.assertEqual(profile.data["full_name"], "API Test User")

        partial_update = self.client.patch(
            "/api/registrations/my-profile/",
            {"about": "Updated without replacing other fields"},
            format="json",
        )
        self.assertEqual(partial_update.status_code, 200, partial_update.data)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.about, "Updated without replacing other fields")
        self.assertEqual(self.registration.full_name, "API Test User")

        image_data = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_data, format="PNG")
        image_update = self.client.patch(
            "/api/registrations/my-profile/",
            {
                "profile_photo": SimpleUploadedFile(
                    "profile.png",
                    image_data.getvalue(),
                    content_type="image/png",
                )
            },
            format="multipart",
        )
        self.assertEqual(image_update.status_code, 200, image_update.data)
        self.registration.refresh_from_db()
        self.assertTrue(self.registration.profile_photo)
        self.assertEqual(self.registration.about, "Updated without replacing other fields")

    def _create_pending_profile_photo(self):
        image_data = BytesIO()
        Image.new("RGB", (2, 2), "purple").save(image_data, format="PNG")
        change = ProfileChange.objects.create(
            registration=self.registration,
            user=self.user,
            previous_status=Registration.Status.PUBLISHED,
        )
        change.pending_profile_photo.save(
            "pending.png",
            SimpleUploadedFile(
                "pending.png",
                image_data.getvalue(),
                content_type="image/png",
            ),
            save=True,
        )
        return change

    def test_pending_profile_photo_endpoint_returns_image_for_owner(self):
        change = self._create_pending_profile_photo()
        self.client.force_authenticate(self.user)

        response = self.client.get(
            f"/api/registrations/pending-files/profile-photo/{change.pk}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(b"".join(response.streaming_content)[:8], b"\x89PNG\r\n\x1a\n")
        response.close()

    def test_pending_profile_photo_endpoint_returns_404_for_missing_change(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/registrations/pending-files/profile-photo/99999/"
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "pending_file_not_found")

    def test_pending_profile_photo_endpoint_returns_404_for_missing_storage_file(self):
        change = self._create_pending_profile_photo()
        change.pending_profile_photo.storage.delete(change.pending_profile_photo.name)
        self.client.force_authenticate(self.user)

        with self.assertLogs("registrations.views", level="ERROR") as captured:
            response = self.client.get(
                f"/api/registrations/pending-files/profile-photo/{change.pk}/"
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "pending_file_not_found")
        self.assertTrue(any(record.exc_info for record in captured.records))

    def test_pending_profile_photo_endpoint_logs_unexpected_errors_and_returns_json(self):
        self.client.force_authenticate(self.user)

        with patch(
            "registrations.views.PendingFileView._get_pending_file",
            side_effect=RuntimeError("private storage failure details"),
        ):
            with self.assertLogs("registrations.views", level="ERROR") as captured:
                response = self.client.get(
                    "/api/registrations/pending-files/profile-photo/3/"
                )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["code"], "pending_file_error")
        self.assertNotIn("private storage failure details", str(response.data))
        self.assertTrue(any(record.exc_info for record in captured.records))

    def test_pending_profile_photo_endpoint_preserves_owner_access_control(self):
        change = self._create_pending_profile_photo()
        other_user = User.objects.create_user(
            email="other-profile-photo@example.com",
            password="pass123",
        )
        self.client.force_authenticate(other_user)

        response = self.client.get(
            f"/api/registrations/pending-files/profile-photo/{change.pk}/"
        )

        self.assertEqual(response.status_code, 403)
