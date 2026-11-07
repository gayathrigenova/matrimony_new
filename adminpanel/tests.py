import os
from smtplib import SMTPServerDisconnected
from io import BytesIO
import tempfile
from datetime import date
from unittest.mock import patch

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
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

    def test_published_profile_update_notifies_client_and_admin_and_stays_pending(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_bytes, format="PNG")
        with patch.dict(
            os.environ,
            {
                "ADMIN_NOTIFICATION_EMAIL": "admin@example.com",
                "ADMIN_DASHBOARD_URL": "https://matrimony.example.com",
            },
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client_api.patch(
                    "/api/registrations/my-profile/",
                    {
                        "about": "Updated biography",
                        "phone": "9111111111",
                        "profile_photo": SimpleUploadedFile(
                            "new-profile.png",
                            image_bytes.getvalue(),
                            content_type="image/png",
                        ),
                    },
                    format="multipart",
                )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "UNDER_REVIEW")
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(mail.outbox[0].subject, "Your Matrimony profile has been updated")
        self.assertEqual(mail.outbox[1].subject, "Matrimony profile update requires review")
        self.assertIn("About", mail.outbox[0].body)
        self.assertIn("Phone", mail.outbox[0].body)
        self.assertIn("Profile Photo", mail.outbox[0].body)
        self.assertIn("About", mail.outbox[1].body)
        self.assertIn("Phone", mail.outbox[1].body)
        self.assertIn("Profile Photo", mail.outbox[1].body)
        self.assertIn("re-approval", mail.outbox[0].body)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(
            ProfileVerification.objects.get(client=self.client_user).status,
            ProfileVerification.Status.UNDER_REVIEW,
        )

    def test_repeating_the_same_pending_update_does_not_send_duplicate_emails(self):
        with patch.dict(os.environ, {"ADMIN_NOTIFICATION_EMAIL": "admin@example.com"}):
            with self.captureOnCommitCallbacks(execute=True):
                first = self.client_api.patch(
                    "/api/registrations/my-profile/",
                    {"about": "Pending biography"},
                    format="json",
                )
                second = self.client_api.patch(
                    "/api/registrations/my-profile/",
                    {"about": "Pending biography"},
                    format="json",
                )

        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(len(mail.outbox), 2)

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
        name_change = next(
            item
            for item in response.data["changed_fields"]
            if item["field_name"] == "full_name"
        )
        self.assertEqual(name_change["old_value"], "Client User")
        self.assertEqual(name_change["new_value"], "Updated Client")
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

    def test_email_change_is_staged_highlighted_and_applied_on_approval(self):
        response = self.client_api.patch(
            "/api/registrations/my-profile/",
            {"email": "updated@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "UNDER_REVIEW")
        self.assertEqual(self.client_user.email, "client@example.com")
        email_change = next(
            item
            for item in response.data["changed_fields"]
            if item["field_name"] == "email"
        )
        self.assertEqual(email_change["old_value"], "client@example.com")
        self.assertEqual(email_change["new_value"], "updated@example.com")

        detail = self.admin_api.get(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertTrue(
            any(
                item["field_name"] == "email"
                for item in detail.data["pending_change"]["changed_fields"]
            )
        )

        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )
        self.assertEqual(approval.status_code, 200, approval.data)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.email, "updated@example.com")

    def test_email_change_rejects_an_address_owned_by_another_account(self):
        User.objects.create_user(email="taken@example.com", ******)

        response = self.client_api.patch(
            "/api/registrations/my-profile/",
            {"email": "taken@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.email, "client@example.com")

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

    def test_missing_pending_photo_can_be_reuploaded_before_approval(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_bytes, format="PNG")
        update = self.client_api.patch(
            "/api/registrations/my-profile/",
            {
                "profile_photo": SimpleUploadedFile(
                    "profile.png",
                    image_bytes.getvalue(),
                    content_type="image/png",
                )
            },
            format="multipart",
        )
        self.assertEqual(update.status_code, 200, update.data)
        change = ProfileChange.objects.get(
            registration=self.registration,
            status=ProfileChange.Status.PENDING_REVIEW,
        )
        change.pending_profile_photo.storage.delete(change.pending_profile_photo.name)

        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )

        self.assertEqual(approval.status_code, 409, approval.data)
        self.assertIn("pending upload files are missing", approval.data["detail"])
        self.assertIn("re-upload the missing files", approval.data["detail"])
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(change.status, ProfileChange.Status.PENDING_REVIEW)

        client_profile = self.client_api.get("/api/registrations/my-profile/")
        self.assertEqual(client_profile.status_code, 200, client_profile.data)
        self.assertTrue(client_profile.data["profile_photo_missing"])

        replacement = self.client_api.patch(
            "/api/registrations/my-profile/",
            {
                "profile_photo": SimpleUploadedFile(
                    "replacement-profile.png",
                    image_bytes.getvalue(),
                    content_type="image/png",
                )
            },
            format="multipart",
        )
        self.assertEqual(replacement.status_code, 200, replacement.data)
        change.refresh_from_db()
        self.assertTrue(
            change.pending_profile_photo.storage.exists(
                change.pending_profile_photo.name
            )
        )
        self.assertEqual(change.status, ProfileChange.Status.PENDING_REVIEW)
        self.registration.refresh_from_db()
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)

        client_profile = self.client_api.get("/api/registrations/my-profile/")
        self.assertFalse(client_profile.data["profile_photo_missing"])
        self.assertIn(
            f"/pending-files/profile-photo/{change.pk}/",
            client_profile.data["profile_photo_url"],
        )
        client_pending_photo = self.client_api.get(
            f"/api/registrations/pending-files/profile-photo/{change.pk}/"
        )
        self.assertEqual(client_pending_photo.status_code, 200)
        client_pending_photo.close()
        admin_detail = self.admin_api.get(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )
        self.assertEqual(admin_detail.status_code, 200, admin_detail.data)
        self.assertIn(
            f"/pending-files/profile-photo/{change.pk}/",
            admin_detail.data["registration"]["profile_photo"],
        )
        pending_photo = self.admin_api.get(
            f"/api/registrations/pending-files/profile-photo/{change.pk}/"
        )
        self.assertEqual(pending_photo.status_code, 200)
        pending_photo.close()

        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )
        self.assertEqual(approval.status_code, 200, approval.data)
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(change.status, ProfileChange.Status.APPROVED)
        self.assertTrue(
            self.registration.profile_photo.storage.exists(
                self.registration.profile_photo.name
            )
        )

    def test_profile_photo_upload_reports_missing_railway_volume_without_saving_reference(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "green").save(image_bytes, format="PNG")
        with patch.dict(
            os.environ,
            {
                "RAILWAY_ENVIRONMENT": "production",
                "RAILWAY_VOLUME_MOUNT_PATH": "",
            },
        ):
            response = self.client_api.patch(
                "/api/registrations/my-profile/",
                {
                    "profile_photo": SimpleUploadedFile(
                        "profile.png",
                        image_bytes.getvalue(),
                        content_type="image/png",
                    )
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, 503, response.data)
        self.assertIn("Railway Volume is not attached", response.data["detail"])
        self.assertFalse(
            ProfileChange.objects.filter(
                registration=self.registration,
                status=ProfileChange.Status.PENDING_REVIEW,
            ).exists()
        )

    def test_approval_skips_gallery_photos_without_pending_uploads(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "green").save(image_bytes, format="PNG")
        photo = ClientPhoto.objects.create(
            registration=self.registration,
            slot_index=1,
            is_main=True,
            status=ClientPhoto.Status.APPROVED,
        )
        photo.photo.save(
            "approved.png",
            SimpleUploadedFile("approved.png", image_bytes.getvalue(), content_type="image/png"),
        )
        profile_photo = SimpleUploadedFile(
            "updated-profile.png",
            image_bytes.getvalue(),
            content_type="image/png",
        )
        update = self.client_api.patch(
            "/api/registrations/my-profile/",
            {"full_name": "Updated Client", "profile_photo": profile_photo},
            format="multipart",
        )
        self.assertEqual(update.status_code, 200, update.data)

        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )

        self.assertEqual(approval.status_code, 200, approval.data)
        detail = self.admin_api.get(f"/api/adminpanel/registrations/{self.registration.pk}/")
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data["pending_photos"], [])
        photo.refresh_from_db()
        self.registration.refresh_from_db()
        self.assertEqual(photo.status, ClientPhoto.Status.APPROVED)
        self.assertEqual(photo.photo.name, self.registration.profile_photo.name)
        self.assertFalse(photo.pending_photo)
        self.assertEqual(self.registration.full_name, "Updated Client")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)

    def test_approval_rejects_pending_change_for_another_user(self):
        update = self.client_api.patch(
            "/api/registrations/my-profile/",
            {"full_name": "Updated Client"},
            format="json",
        )
        self.assertEqual(update.status_code, 200, update.data)
        change = ProfileChange.objects.get(
            registration=self.registration,
            status=ProfileChange.Status.PENDING_REVIEW,
        )
        change.user = self.admin_user
        change.save(update_fields=["user"])

        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )

        self.assertEqual(approval.status_code, 409, approval.data)
        self.assertEqual(approval.data["code"], "invalid_pending_change")
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Client User")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(change.status, ProfileChange.Status.PENDING_REVIEW)

    def test_published_profile_approval_sends_success_email_after_database_commit(self):
        change = ProfileChange.objects.create(
            registration=self.registration,
            user=self.client_user,
            previous_status=Registration.Status.PUBLISHED,
            pending_data={"full_name": "Approved Client"},
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.admin_api.post(
                f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
            )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            mail.outbox[0].subject,
            "Your Updated Matrimony Profile Has Been Approved",
        )
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Approved Client")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(change.status, ProfileChange.Status.APPROVED)

    def test_published_profile_approval_succeeds_when_recipient_email_is_missing(self):
        self.client_user.email = ""
        self.client_user.save(update_fields=["email"])
        change = ProfileChange.objects.create(
            registration=self.registration,
            user=self.client_user,
            previous_status=Registration.Status.PUBLISHED,
            pending_data={"full_name": "Approved Client"},
        )

        with self.assertLogs("notifications.emailing", level="WARNING") as captured:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.admin_api.post(
                    f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
                )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(any("recipient email is missing" in record.getMessage() for record in captured.records))
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Approved Client")
        self.assertEqual(change.status, ProfileChange.Status.APPROVED)
        self.assertEqual(mail.outbox, [])

    def test_published_profile_approval_survives_smtp_failure(self):
        change = ProfileChange.objects.create(
            registration=self.registration,
            user=self.client_user,
            previous_status=Registration.Status.PUBLISHED,
            pending_data={"full_name": "Approved Client"},
        )

        with patch(
            "notifications.emailing.send_mail",
            side_effect=SMTPServerDisconnected("please run connect() first"),
        ):
            with self.assertLogs("notifications.emailing", level="ERROR") as captured:
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.admin_api.post(
                        f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
                    )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(any(record.exc_info for record in captured.records))
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Approved Client")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(change.status, ProfileChange.Status.APPROVED)

    def test_database_error_during_approval_is_not_reported_as_success(self):
        change = ProfileChange.objects.create(
            registration=self.registration,
            user=self.client_user,
            previous_status=Registration.Status.PUBLISHED,
            pending_data={"full_name": "Should Not Be Saved"},
        )

        with patch(
            "adminpanel.views.Registration.save",
            side_effect=IntegrityError("simulated database constraint failure"),
        ):
            with self.assertLogs("adminpanel.views", level="ERROR") as captured:
                response = self.admin_api.post(
                    f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
                )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["code"], "approval_failed")
        self.assertNotIn("simulated database constraint failure", str(response.data))
        self.assertTrue(any(record.exc_info for record in captured.records))
        self.registration.refresh_from_db()
        change.refresh_from_db()
        self.assertEqual(self.registration.full_name, "Client User")
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(change.status, ProfileChange.Status.PENDING_REVIEW)

    def test_unexpected_approval_error_is_logged_and_returns_safe_json(self):
        with patch(
            "adminpanel.views.pending_change",
            side_effect=RuntimeError("internal database failure details"),
        ):
            with self.assertLogs("adminpanel.views", level="ERROR") as captured:
                response = self.admin_api.post(
                    f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
                )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["code"], "approval_failed")
        self.assertNotIn("internal database failure details", str(response.data))
        self.assertTrue(any(record.exc_info for record in captured.records))

    def test_multiple_published_gallery_uploads_are_saved_and_leave_profile_published(self):
        for slot_index, color in ((1, "red"), (2, "green")):
            image_bytes = BytesIO()
            Image.new("RGB", (2, 2), color).save(image_bytes, format="PNG")
            response = self.client_api.post(
                "/api/registrations/photos/upload/",
                {
                    "slot_index": str(slot_index),
                    "photo": SimpleUploadedFile(
                        f"photo-{slot_index}.png",
                        image_bytes.getvalue(),
                        content_type="image/png",
                    ),
                },
                format="multipart",
            )
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(response.data["photo"]["pending_photo_url"])

        self.registration.refresh_from_db()
        self.assertEqual(self.registration.status, Registration.Status.PUBLISHED)
        self.assertEqual(
            ProfileVerification.objects.get(client=self.client_user).status,
            ProfileVerification.Status.UNDER_REVIEW,
        )
        self.assertEqual(ClientPhoto.objects.filter(registration=self.registration).count(), 2)

        gallery = self.client_api.get("/api/registrations/photos/")
        self.assertEqual(gallery.status_code, 200)
        self.assertEqual(len(gallery.data), 4)
        self.assertTrue(gallery.data[0]["pending_photo_url"])
        self.assertTrue(gallery.data[1]["pending_photo_url"])
        self.assertEqual(gallery.data[2]["status"], "EMPTY")

    def test_gallery_delete_waits_for_review_and_keeps_next_main_photo_in_sync(self):
        photos = []
        for slot_index, color in ((1, "red"), (2, "green")):
            image_bytes = BytesIO()
            Image.new("RGB", (2, 2), color).save(image_bytes, format="PNG")
            photo = ClientPhoto.objects.create(
                registration=self.registration,
                slot_index=slot_index,
                is_main=slot_index == 1,
                status=ClientPhoto.Status.APPROVED,
            )
            photo.photo.save(
                f"photo-{slot_index}.png",
                SimpleUploadedFile(
                    f"photo-{slot_index}.png",
                    image_bytes.getvalue(),
                    content_type="image/png",
                ),
            )
            photos.append(photo)

        self.registration.profile_photo = photos[0].photo
        self.registration.save(update_fields=["profile_photo", "updated_at"])

        response = self.client_api.delete("/api/registrations/photos/1/delete/")
        self.assertEqual(response.status_code, 200, response.data)
        first_photo = ClientPhoto.objects.get(registration=self.registration, slot_index=1)
        self.assertTrue(first_photo.pending_delete)
        self.assertTrue(first_photo.photo)

        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )
        self.assertEqual(approval.status_code, 200, approval.data)
        self.assertFalse(
            ClientPhoto.objects.filter(
                registration=self.registration,
                slot_index=1,
            ).exists()
        )
        self.registration.refresh_from_db()
        next_photo = ClientPhoto.objects.get(registration=self.registration, slot_index=2)
        self.assertEqual(self.registration.profile_photo.name, next_photo.photo.name)
        self.assertTrue(next_photo.is_main)

    def test_gallery_delete_can_remove_legacy_main_profile_photo_without_a_gallery_record(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_bytes, format="PNG")
        self.registration.profile_photo.save(
            "legacy-main.png",
            SimpleUploadedFile("legacy-main.png", image_bytes.getvalue(), content_type="image/png"),
            save=True,
        )

        response = self.client_api.delete("/api/registrations/photos/1/delete/")

        self.assertEqual(response.status_code, 200, response.data)
        self.registration.refresh_from_db()
        self.assertTrue(self.registration.profile_photo)
        self.assertTrue(
            ClientPhoto.objects.get(
                registration=self.registration,
                slot_index=1,
            ).pending_delete
        )
        approval = self.admin_api.post(
            f"/api/adminpanel/registrations/{self.registration.pk}/approve/"
        )
        self.assertEqual(approval.status_code, 200, approval.data)
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.profile_photo)

    def test_client_cannot_approve_registration(self):
        response = self.client_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/")
        self.assertEqual(response.status_code, 403)

    def test_client_cannot_delete_registration(self):
        response = self.client_api.delete(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Registration.objects.filter(pk=self.registration.pk).exists())

    def test_admin_can_delete_profile_and_related_records(self):
        ProfileVerification.objects.create(client=self.client_user)
        ProfileChange.objects.create(
            registration=self.registration,
            user=self.client_user,
        )
        self.registration.photos.create(slot_index=1)

        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_bytes, format="PNG")
        self.registration.profile_photo.save(
            "profile.png",
            SimpleUploadedFile(
                "profile.png",
                image_bytes.getvalue(),
                content_type="image/png",
            ),
            save=True,
        )
        profile_photo_storage = self.registration.profile_photo.storage
        profile_photo_name = self.registration.profile_photo.name

        with self.captureOnCommitCallbacks(execute=True):
            response = self.admin_api.delete(
                f"/api/adminpanel/registrations/{self.registration.pk}/"
            )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Registration.objects.filter(pk=self.registration.pk).exists())
        self.assertFalse(ClientPhoto.objects.filter(registration=self.registration).exists())
        self.assertFalse(ProfileChange.objects.filter(user=self.client_user).exists())
        self.assertFalse(ProfileVerification.objects.filter(client=self.client_user).exists())
        self.assertFalse(User.objects.filter(pk=self.client_user.pk).exists())
        self.assertFalse(profile_photo_storage.exists(profile_photo_name))

    def test_deleting_one_profile_keeps_account_with_other_profiles(self):
        other_registration = Registration.objects.create(
            user=self.client_user,
            full_name="Another Profile",
            gender="Female",
            date_of_birth=date(1997, 1, 1),
        )

        response = self.admin_api.delete(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Registration.objects.filter(pk=self.registration.pk).exists())
        self.assertTrue(Registration.objects.filter(pk=other_registration.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.client_user.pk).exists())

    def test_registration_list_is_available_to_admin_but_forbidden_to_client(self):
        client_response = self.client_api.get("/api/adminpanel/registrations/")
        admin_response = self.admin_api.get("/api/adminpanel/registrations/")

        self.assertEqual(client_response.status_code, 403)
        self.assertEqual(admin_response.status_code, 200, admin_response.data)
        self.assertEqual(len(admin_response.data), 1)

    def test_initial_profile_email_is_sent_after_publication(self):
        self.registration.status = Registration.Status.PENDING
        self.registration.save(update_fields=["status"])
        self.assertFalse(
            ProfileVerification.objects.filter(client=self.client_user).exists()
        )
        with self.captureOnCommitCallbacks(execute=True):
            approved = self.admin_api.post(f"/api/adminpanel/registrations/{self.registration.pk}/approve/")
            self.assertEqual(approved.status_code, 200)
            self.assertEqual(approved.data["status"], Registration.Status.APPROVED)
            self.assertEqual(approved.data["matrimony_id"], self.registration.matrimony_id)
            self.assertEqual(
                ProfileVerification.objects.get(client=self.client_user).status,
                ProfileVerification.Status.APPROVED,
            )
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
