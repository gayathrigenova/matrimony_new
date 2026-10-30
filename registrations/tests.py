from datetime import date, timedelta
from io import BytesIO
import tempfile
import re
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from adminpanel.models import ProfileChange

from .models import Registration, VerificationChallenge
from .verification import VerificationDeliveryError


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

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        ADMIN_NOTIFICATION_EMAIL="admin@example.com",
        ADMIN_DASHBOARD_URL="https://matrimony.example.com",
    )
    def test_new_email_and_phone_are_accepted_and_email_is_normalized(self):
        with patch("registrations.views.send_mobile_otp") as send_sms:
            start = self.client.post(
                "/api/registrations/verification/start/",
                {"email": "New.User@Example.com", "phone": "9123456780"},
                format="json",
            )
            self.assertEqual(start.status_code, 200, start.data)
            email_otp = re.search(r"\b\d{6}\b", mail.outbox[0].body).group()
            mobile_otp = send_sms.call_args.args[1]

            email_verified = self.client.post(
                "/api/registrations/verification/verify/",
                {
                    "challenge_id": start.data["challenge_id"],
                    "channel": "email",
                    "otp": email_otp,
                },
                format="json",
            )
            self.assertEqual(email_verified.status_code, 200, email_verified.data)
            self.assertNotIn("verification_token", email_verified.data)

            mobile_verified = self.client.post(
                "/api/registrations/verification/verify/",
                {
                    "challenge_id": start.data["challenge_id"],
                    "channel": "mobile",
                    "otp": mobile_otp,
                },
                format="json",
            )
            self.assertEqual(mobile_verified.status_code, 200, mobile_verified.data)
            self.assertNotIn(email_otp, json.dumps(start.data))
            self.assertNotIn(mobile_otp, json.dumps(start.data))

            with patch.dict(
                "os.environ",
                {
                    "ADMIN_NOTIFICATION_EMAIL": "admin@example.com",
                    "ADMIN_DASHBOARD_URL": "https://matrimony.example.com",
                },
            ):
                with self.captureOnCommitCallbacks(execute=True) as callbacks:
                    response = self.client.post(
                        "/api/registrations/",
                        {
                            "full_name": "New User",
                            "gender": "Male",
                            "date_of_birth": "1994-01-01",
                            "email": "  New.User@Example.com ",
                            "password": "pass123",
                            "phone": " 9123456780 ",
                            "verification_token": mobile_verified.data["verification_token"],
                        },
                        format="json",
                    )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(callbacks), 1)
        self.assertTrue(User.objects.filter(email="new.user@example.com").exists())
        registration = Registration.objects.get(phone="9123456780")
        challenge = VerificationChallenge.objects.get(
            pk=mobile_verified.data["verification_token"]
        )
        self.assertIsNotNone(challenge.consumed_at)
        self.assertEqual(len(mail.outbox), 3)
        self.assertEqual(mail.outbox[1].subject, "Your Matrimony registration is complete")
        self.assertIn("New User", mail.outbox[1].body)
        self.assertIn(registration.created_at.strftime("%B"), mail.outbox[1].body)
        self.assertIn("pending admin verification", mail.outbox[1].body)
        self.assertEqual(mail.outbox[2].subject, "New Matrimony registration requires review")
        self.assertIn(f"/admin/view/{registration.pk}", mail.outbox[2].body)

    def test_registration_cannot_complete_without_both_contact_verifications(self):
        response = self.client.post(
            "/api/registrations/",
            {
                "full_name": "Unverified User",
                "gender": "Male",
                "date_of_birth": "1994-01-01",
                "email": "unverified@example.com",
                "password": "pass123",
                "phone": "9123456780",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("verification_token", response.data)
        self.assertFalse(User.objects.filter(email="unverified@example.com").exists())

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_MAX_ATTEMPTS=2,
    )
    @patch("registrations.views.send_mobile_otp")
    def test_otp_is_hashed_attempts_are_limited_and_codes_are_not_returned(self, send_sms):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "secure@example.com", "phone": "9123456780"},
            format="json",
        )
        self.assertEqual(start.status_code, 200, start.data)
        email_otp = re.search(r"\b\d{6}\b", mail.outbox[-1].body).group()
        mobile_otp = send_sms.call_args.args[1]
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        self.assertTrue(check_password(email_otp, challenge.email_otp_hash))
        self.assertTrue(check_password(mobile_otp, challenge.phone_otp_hash))

        for attempt in range(2):
            response = self.client.post(
                "/api/registrations/verification/verify/",
                {
                    "challenge_id": start.data["challenge_id"],
                    "channel": "email",
                    "otp": "000000" if email_otp != "000000" else "000001",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["attempts_remaining"], 1 - attempt)

        blocked = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
                "otp": email_otp,
            },
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertNotIn(email_otp, json.dumps(start.data))

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_RESEND_COOLDOWN_SECONDS=60,
    )
    @patch("registrations.views.send_mobile_otp")
    def test_resend_obeys_cooldown_and_rotates_the_otp(self, send_sms):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "resend@example.com", "phone": "9123456780"},
            format="json",
        )
        self.assertEqual(start.status_code, 200, start.data)
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        original_hash = challenge.email_otp_hash

        too_soon = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "email"},
            format="json",
        )
        self.assertEqual(too_soon.status_code, 429)
        self.assertGreater(too_soon.data["resend_after"], 0)

        challenge.email_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["email_resend_after"])
        resent = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "email"},
            format="json",
        )
        self.assertEqual(resent.status_code, 200, resent.data)
        challenge.refresh_from_db()
        self.assertNotEqual(challenge.email_otp_hash, original_hash)
        self.assertNotIn("otp", json.dumps(resent.data).lower())

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch("registrations.views.send_mobile_otp")
    def test_restarting_an_active_challenge_does_not_reset_attempts_or_resend(self, send_sms):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "resume@example.com", "phone": "9123456780"},
            format="json",
        )
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        challenge.email_attempts = 1
        challenge.save(update_fields=["email_attempts"])

        resumed = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "resume@example.com", "phone": "9123456780"},
            format="json",
        )

        self.assertEqual(resumed.status_code, 200, resumed.data)
        self.assertEqual(resumed.data["challenge_id"], start.data["challenge_id"])
        self.assertTrue(resumed.data["verification_in_progress"])
        challenge.refresh_from_db()
        self.assertEqual(challenge.email_attempts, 1)
        send_sms.assert_called_once()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch(
        "registrations.views.send_mobile_otp",
        side_effect=VerificationDeliveryError("SMS provider unavailable"),
    )
    def test_sms_delivery_failure_blocks_verification_start(self, send_sms):
        response = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "sms-failure@example.com", "phone": "9123456780"},
            format="json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["failed_channels"], ["mobile"])
        self.assertTrue(
            VerificationChallenge.objects.filter(
                email="sms-failure@example.com",
                consumed_at__isnull=False,
            ).exists()
        )
        send_sms.assert_called_once()


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

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_profile_update_sends_client_and_admin_notifications(self):
        self.client.force_authenticate(self.user)
        with patch.dict(
            "os.environ",
            {
                "ADMIN_NOTIFICATION_EMAIL": "admin@example.com",
                "ADMIN_DASHBOARD_URL": "https://matrimony.example.com",
            },
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.patch(
                    "/api/registrations/my-profile/",
                    {"about": "Updated profile biography"},
                    format="json",
                )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(mail.outbox[0].subject, "Your Matrimony profile has been updated")
        self.assertIn("About", mail.outbox[0].body)
        self.assertIn("may require admin re-approval", mail.outbox[0].body)
        self.assertEqual(mail.outbox[1].subject, "Matrimony profile update requires review")
        self.assertIn("About", mail.outbox[1].body)
        self.assertIn(f"/admin/view/{self.registration.pk}", mail.outbox[1].body)

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

    def test_horoscope_jpeg_upload_view_and_delete_are_owner_authenticated(self):
        image_data = BytesIO()
        Image.new("RGB", (2, 2), "green").save(image_data, format="JPEG")
        upload = SimpleUploadedFile(
            "horoscope.jpg",
            image_data.getvalue(),
            content_type="image/jpeg",
        )
        endpoint = "/api/registrations/my-profile/horoscope/"
        self.client.force_authenticate(None)
        unauthenticated_response = self.client.get(endpoint)
        self.assertEqual(unauthenticated_response.status_code, 401)
        self.client.force_authenticate(self.user)

        upload_response = self.client.post(
            endpoint,
            {"horoscope_file": upload},
            format="multipart",
        )

        self.assertEqual(upload_response.status_code, 200, upload_response.data)
        self.assertTrue(upload_response.data["horoscope_file_url"].endswith(endpoint))
        self.registration.refresh_from_db()
        self.assertTrue(self.registration.horoscope_file)

        profile_response = self.client.get("/api/registrations/my-profile/")
        self.assertEqual(profile_response.status_code, 200, profile_response.data)
        self.assertTrue(profile_response.data["horoscope_file_url"].endswith(endpoint))

        file_response = self.client.get(endpoint)
        self.assertEqual(file_response.status_code, 200)
        self.assertEqual(file_response["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(file_response.streaming_content).startswith(b"\xff\xd8"))
        file_response.close()

        delete_response = self.client.delete(endpoint)
        self.assertEqual(delete_response.status_code, 200, delete_response.data)
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.horoscope_file)

    def test_horoscope_upload_rejects_non_jpeg_content(self):
        image_data = BytesIO()
        Image.new("RGB", (2, 2), "blue").save(image_data, format="PNG")
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/registrations/my-profile/horoscope/",
            {
                "horoscope_file": SimpleUploadedFile(
                    "horoscope.jpg",
                    image_data.getvalue(),
                    content_type="image/jpeg",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("valid JPG", response.data["detail"])

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
