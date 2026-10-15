import os
from io import BytesIO
import tempfile
from datetime import date
from unittest.mock import patch

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from adminpanel.models import ProfileChange, ProfileVerification
from registrations.models import ClientPhoto, Registration


class ProfileReviewWorkflowTests(TestCase):
    def setUp(self):
        self.media_dir = tempfile.TemporaryDirectory()
        self.media_override = override_settings(
            MEDIA_ROOT=self.media_dir.name,
            EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        )
        self.media_override.enable()
        self.client_user = User.objects.create_user(
            email="client@example.com", password="good-password", full_name="Client User"
        )
        self.admin_user = User.objects.create_user(
            email="admin@example.com", password="good-password", full_name="Admin User", role=User.Role.ADMIN
        )
        self.registration = Registration.objects.create(
            user=self.client_user,
            full_name="Client User",
            gender="Female",
            date_of_birth=date(1998, 1, 1),
            status=Registration.Status.PUBLISHED,
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.client_user)
        self.admin_api = APIClient()
        self.admin_api.force_authenticate(self.admin_user)

    def tearDown(self):
        self.media_override.disable()
        self.media_dir.cleanup()

    def test_client_edit_is_staged_until_admin_approval(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_bytes, format="PNG")
        with patch.dict(os.environ, {"ADMIN_NOTIFICATION_EMAIL": "admin@example.com"}):
            response = self.client_api.patch(
                "/api/registrations/my-profile/",
                {
                    "full_name": "Updated Client",
                    "date_of_birth": "1998-01-01",
                    "profile_photo": SimpleUploadedFile("profile.png", image_bytes.getvalue(), content_type="image/png"),
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, 200)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Client User")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertFalse(self.registration.profile_photo)
        self.assertEqual(response.data["status"], "UNDER_REVIEW")
        self.assertEqual(response.data["pending_data"]["full_name"], "Updated Client")
        self.assertEqual(ProfileVerification.objects.get(client=self.client_user).status, "UNDER_REVIEW")
        self.assertTrue(ProfileChange.objects.filter(registration=self.registration, status="PENDING_REVIEW").exists())

        detail = self.admin_api.get(f"/api/adminpanel/registrations/{self.registration.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["registration"]["full_name"], "Updated Client")

        approve = self.admin_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/")
        self.assertEqual(approve.status_code, 200)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Updated Client")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertTrue(self.registration.profile_photo)
        self.assertNotIn("pending_changes", self.registration.profile_photo.name)
        main_photo = ClientPhoto.objects.get(registration=self.registration, slot_index=1)
        self.assertEqual(main_photo.status, ClientPhoto.Status.APPROVED)

    def test_pending_gallery_photo_is_private_and_published_on_approval(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "red").save(image_bytes, format="PNG")
        image = SimpleUploadedFile("portrait.png", image_bytes.getvalue(), content_type="image/png")
        response = self.client_api.post(
            "/api/registrations/photos/upload/",
            {"slot_index": "1", "photo": image},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        photo = ClientPhoto.objects.get(registration=self.registration, slot_index=1)
        self.assertTrue(photo.pending_photo)

        pending_url = response.data["photo"]["pending_photo_url"]
        stranger = User.objects.create_user(email="other@example.com", password="good-password")
        stranger_api = APIClient()
        stranger_api.force_authenticate(stranger)
        self.assertEqual(stranger_api.get(pending_url).status_code, 403)

        self.assertEqual(self.admin_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/").status_code, 200)
        photo.refresh_from_db()
        self.assertEqual(photo.status, ClientPhoto.Status.APPROVED)
        self.assertFalse(photo.pending_photo)
        self.assertNotIn("pending_gallery", photo.photo.name)

    def test_client_cannot_approve_registration(self):
        response = self.client_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/")
        self.assertEqual(response.status_code, 403)

    def test_initial_profile_email_is_sent_after_publication(self):
        self.registration.status = Registration.Status.PENDING
        self.registration.save(update_fields=["status"])
        with self.captureOnCommitCallbacks(execute=True):
            approved = self.admin_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/")
            self.assertEqual(approved.status_code, 200)
            published = self.admin_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/publish/")
            self.assertEqual(published.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Your Matrimony Profile Has Been Approved")
        self.assertEqual(
            self.admin_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/").status_code,
            200,
        )
        self.assertEqual(len(mail.outbox), 1)

    def test_rejected_published_profile_edit_keeps_approved_version_live(self):
        with self.captureOnCommitCallbacks(execute=True):
            changed = self.client_api.patch(
                "/api/registrations/my-profile/",
                {"full_name": "Unapproved Name"},
                format="multipart",
            )
            self.assertEqual(changed.status_code, 200)
            rejected = self.admin_api.post(
                f"/api/adminpanel/registrations/{self.registration.pk}/reject/",
                {"rejection_reason": "Please correct the profile details."},
                format="json",
            )
            self.assertEqual(rejected.status_code, 200)

        self.registration.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Client User")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(mail.outbox[-1].subject, "Update about your Matrimony profile")
        self.assertIn("Please correct the profile details.", mail.outbox[-1].body)
