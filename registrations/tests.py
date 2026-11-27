from datetime import date, timedelta
import hashlib
from io import BytesIO
import tempfile
import re
import json
import smtplib
from unittest.mock import Mock, patch
from urllib.parse import parse_qs

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.conf import settings
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from anymail.exceptions import AnymailError
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from adminpanel.models import ProfileChange

from .models import Registration, VerificationChallenge
from .serializers import RegistrationSerializer
from .verification import (
    VerificationDeliveryError,
    _genova_auth_signature,
    _send_genova_registration_otp,
    send_email_otp,
)


User = get_user_model()


class GenovaSmsRequestTests(TestCase):
    def test_request_uses_curl_form_fields_and_same_expiry_for_signature(self):
        with override_settings(
            GENOVA_SMS_ACCESS_TOKEN="test-access-token",
            GENOVA_SMS_ACCESS_TOKEN_KEY="test-access-token-key",
            GENOVA_SMS_API_URL="https://sms.genovatechnologies.com/api/sms/v1.0/send-sms",
            GENOVA_SMS_ROUTE="transactional",
            GENOVA_SMS_HEADER="TESTID",
            GENOVA_SMS_ENTITY_ID="1234567890123456789",
            GENOVA_OTP_TEMPLATE_ID="9876543210987654321",
            GENOVA_SMS_CONTENT_TYPE="text",
            GENOVA_SMS_WEBHOOK_ID="test-webhook-id",
            SMS_TIMEOUT=10,
        ), patch("registrations.verification.datetime") as mock_datetime, patch(
            "registrations.verification._genova_auth_signature",
            return_value="test-signature",
        ) as mock_signature, patch(
            "registrations.verification.urlopen"
        ) as mock_urlopen:
            mock_datetime.now.return_value.timestamp.return_value = 1724837770.9
            response = mock_urlopen.return_value.__enter__.return_value
            response.status = 200
            response.read.return_value = b'{"status":"success"}'

            result = _send_genova_registration_otp("+919123456789", "123456")

        self.assertEqual(result, "sent")
        mock_signature.assert_called_once_with(
            "test-access-token", "test-access-token-key", 1724837830
        )
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(
            request.full_url,
            "https://sms.genovatechnologies.com/api/sms/v1.0/send-sms",
        )
        self.assertEqual(
            request.get_header("Content-type"),
            "application/x-www-form-urlencoded",
        )
        self.assertEqual(request.get_header("Accept"), "application/json")
        form = parse_qs(request.data.decode("ascii"))
        self.assertEqual(form["RequestFor"], ["send-sms"])
        self.assertEqual(form["expire"], ["1724837830"])
        self.assertEqual(form["authSignature"], ["test-signature"])
        self.assertEqual(form["accessToken"], ["test-access-token"])
        self.assertEqual(form["route"], ["transactional"])
        self.assertEqual(form["contentType"], ["text"])
        self.assertEqual(form["messageContent"], [
            "Your Keralakkara Matrimony registration OTP is 123456. "
            "Valid for 10 minutes. Do not share this OTP with anyone."
        ])
        self.assertEqual(form["removeDuplicateNumbers"], ["1"])
        self.assertEqual(form["smsHeader"], ["TESTID"])
        self.assertEqual(form["recipients"], ["+919123456789"])
        self.assertEqual(form["entityId"], ["1234567890123456789"])
        self.assertEqual(form["templateId"], ["9876543210987654321"])
        self.assertEqual(form["webHookId"], ["test-webhook-id"])

    def test_signature_uses_documented_md5_steps(self):
        access_token = "test-access-token"
        access_token_key = "test-access-token-key"
        expire = 1724837830
        time_key = hashlib.md5(
            f"send-smssms@rits-v1.0{expire}".encode("utf-8")
        ).hexdigest()
        time_access_token_key = hashlib.md5(
            f"{access_token}{time_key}".encode("utf-8")
        ).hexdigest()
        expected = hashlib.md5(
            f"{time_access_token_key}{access_token_key}".encode("utf-8")
        ).hexdigest()

        self.assertEqual(
            _genova_auth_signature(access_token, access_token_key, expire),
            expected,
        )


class RegistrationCasteValidationTests(TestCase):
    def test_only_thiyya_and_ezhava_are_accepted(self):
        caste_field = RegistrationSerializer().fields["caste"]

        self.assertEqual(caste_field.run_validation("Thiyya"), "Thiyya")
        self.assertEqual(caste_field.run_validation("Ezhava"), "Ezhava")
        with self.assertRaises(ValidationError):
            caste_field.run_validation("Nair")


class RegistrationBirthStarTests(TestCase):
    def test_birth_star_serializer_accepts_known_values_and_rejects_unknown_values(self):
        birth_star_field = RegistrationSerializer().fields["birth_star"]

        self.assertEqual(birth_star_field.run_validation("Ashwathi"), "Ashwathi")
        self.assertEqual(birth_star_field.run_validation("Revathi"), "Revathi")
        with self.assertRaises(ValidationError):
            birth_star_field.run_validation("Unknown")

    def test_published_profiles_can_be_filtered_by_birth_star(self):
        matching_user = User.objects.create_user(email="star-match@example.com", password="pass123")
        other_user = User.objects.create_user(email="other-star@example.com", password="pass123")
        Registration.objects.create(
            user=matching_user,
            full_name="Matching Star",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            birth_star="Ashwathi",
            status=Registration.Status.PUBLISHED,
        )
        Registration.objects.create(
            user=other_user,
            full_name="Other Star",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            birth_star="Revathi",
            status=Registration.Status.PUBLISHED,
        )

        client = APIClient()
        client.force_authenticate(matching_user)
        response = client.get(
            "/api/registrations/published/",
            {"birth_star": "ashwathi"},
        )

        self.assertEqual(response.status_code, 200)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        self.assertEqual([profile["full_name"] for profile in results], ["Matching Star"])
        self.assertEqual(results[0]["birth_star"], "Ashwathi")

    def test_published_profiles_can_be_filtered_by_education_level(self):
        matching_user = User.objects.create_user(
            email="undergraduate-match@example.com",
            password="test-password",
        )
        other_user = User.objects.create_user(
            email="diploma-match@example.com",
            password="test-password",
        )
        Registration.objects.create(
            user=matching_user,
            full_name="Undergraduate Profile",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            education_level="Undergraduate",
            education="Computer Science",
            status=Registration.Status.PUBLISHED,
        )
        Registration.objects.create(
            user=other_user,
            full_name="Diploma Profile",
            gender="Female",
            date_of_birth=date(1995, 1, 1),
            education_level="Diploma",
            education="Computer Science",
            status=Registration.Status.PUBLISHED,
        )

        client = APIClient()
        client.force_authenticate(matching_user)
        response = client.get(
            "/api/registrations/published/",
            {"education": "Undergraduate"},
        )

        self.assertEqual(response.status_code, 200)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        self.assertEqual(
            [profile["full_name"] for profile in results],
            ["Undergraduate Profile"],
        )

    def test_published_profiles_apply_all_partner_search_filters_together(self):
        today = date.today()
        matching_dob = date(today.year - 30, today.month, today.day)
        matching_user = User.objects.create_user(
            email="combined-match@example.com",
            password="test-password",
        )
        wrong_height_user = User.objects.create_user(
            email="wrong-height@example.com",
            password="test-password",
        )
        approved_user = User.objects.create_user(
            email="approved-only@example.com",
            password="test-password",
        )

        Registration.objects.create(
            user=matching_user,
            full_name="Matching Profile",
            gender="Female",
            date_of_birth=matching_dob,
            religion="Hindu",
            caste="Thiyya",
            birth_star="Ashwathi",
            height="5'5\"",
            status=Registration.Status.PUBLISHED,
        )
        Registration.objects.create(
            user=wrong_height_user,
            full_name="Wrong Height",
            gender="Female",
            date_of_birth=matching_dob,
            religion="Hindu",
            caste="Thiyya",
            birth_star="Ashwathi",
            height="6'0\"",
            status=Registration.Status.PUBLISHED,
        )
        mismatch_profiles = [
            ("wrong-gender@example.com", "Wrong Gender", {"gender": "Male"}),
            ("wrong-religion@example.com", "Wrong Religion", {"religion": "Christian"}),
            ("wrong-caste@example.com", "Wrong Caste", {"caste": "Ezhava"}),
            ("wrong-star@example.com", "Wrong Star", {"birth_star": "Revathi"}),
            (
                "too-young@example.com",
                "Too Young",
                {"date_of_birth": date(today.year - 20, today.month, today.day)},
            ),
            (
                "too-old@example.com",
                "Too Old",
                {"date_of_birth": date(today.year - 40, today.month, today.day)},
            ),
        ]
        for email, name, overrides in mismatch_profiles:
            user = User.objects.create_user(email=email, password="test-password")
            profile_fields = {
                "gender": "Female",
                "date_of_birth": matching_dob,
                "religion": "Hindu",
                "caste": "Thiyya",
                "birth_star": "Ashwathi",
                "height": "5'5\"",
            }
            profile_fields.update(overrides)
            Registration.objects.create(
                user=user,
                full_name=name,
                status=Registration.Status.PUBLISHED,
                **profile_fields,
            )
        Registration.objects.create(
            user=approved_user,
            full_name="Not Publicly Published",
            gender="Female",
            date_of_birth=matching_dob,
            religion="Hindu",
            caste="Thiyya",
            birth_star="Ashwathi",
            height="5'5\"",
            status=Registration.Status.APPROVED,
        )

        client = APIClient()
        client.force_authenticate(matching_user)
        response = client.get(
            "/api/registrations/published/",
            {
                "gender": "Female",
                "religion": "Hindu",
                "caste": "Thiyya",
                "birth_star": "Ashwathi",
                "age_from": "29",
                "age_to": "31",
                "height_from_cm": "165",
                "height_to_cm": "178",
            },
        )

        self.assertEqual(response.status_code, 200)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        self.assertEqual([profile["full_name"] for profile in results], ["Matching Profile"])
        self.assertNotIn("phone", results[0])
        self.assertNotIn("email", results[0])


class PublishedMatrimonyIdSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="matrimony-search@example.com",
            password="test-password",
        )
        self.profile = Registration.objects.create(
            user=self.user,
            matrimony_id="WN100004",
            full_name="Anjali",
            gender="Female",
            date_of_birth=date(2003, 1, 22),
            occupation="Software Developer",
            caste="Thiyya",
            district="Kollam",
            state="Kerala",
            phone="9876543210",
            status=Registration.Status.PUBLISHED,
        )

    def test_profile_search_requires_an_authenticated_member(self):
        response = self.client.get(
            "/api/registrations/published/by-matrimony-id/",
            {"matrimony_id": "WN100004"},
        )

        self.assertEqual(response.status_code, 401)

    def test_search_is_case_insensitive_and_ignores_spaces(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(
            "/api/registrations/published/by-matrimony-id/",
            {"matrimony_id": "  wn 100004  "},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.profile.id)
        self.assertEqual(response.data["full_name"], "Anjali")
        self.assertEqual(response.data["matrimony_id"], "WN100004")
        self.assertNotIn("phone", response.data)
        self.assertNotIn("email", response.data)
        self.assertNotIn("contact_phone", response.data)

    def test_search_returns_requested_not_found_message(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(
            "/api/registrations/published/by-matrimony-id/",
            {"matrimony_id": "WN999999"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.data["detail"],
            "No profile found for this Matrimony ID.",
        )

    def test_search_does_not_return_unpublished_profiles(self):
        self.client.force_authenticate(self.user)
        self.profile.status = Registration.Status.APPROVED
        self.profile.save(update_fields=["status"])

        response = self.client.get(
            "/api/registrations/published/by-matrimony-id/",
            {"matrimony_id": "WN100004"},
        )

        self.assertEqual(response.status_code, 404)

    def test_published_profile_list_and_detail_require_authentication(self):
        list_response = self.client.get("/api/registrations/published/")
        detail_response = self.client.get(
            f"/api/registrations/published/{self.profile.pk}/",
        )

        self.assertEqual(list_response.status_code, 401)
        self.assertEqual(detail_response.status_code, 401)

    def test_published_profile_endpoints_reject_non_client_users(self):
        self.user.role = User.Role.ADMIN
        self.user.save(update_fields=["role"])
        self.client.force_authenticate(self.user)

        responses = [
            self.client.get("/api/registrations/published/"),
            self.client.get(
                f"/api/registrations/published/{self.profile.pk}/",
            ),
            self.client.get(
                "/api/registrations/published/by-matrimony-id/",
                {"matrimony_id": "WN100004"},
            ),
        ]

        self.assertEqual([response.status_code for response in responses], [403, 403, 403])


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
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    def test_channel_start_verifies_only_the_selected_contact(self, send_sms):
        email_start = self.client.post(
            "/api/registrations/verification/start/",
            {
                "channel": "email",
                "email": "new-email@example.com",
                "phone": "9876543210",
            },
            format="json",
        )
        self.assertEqual(email_start.status_code, 200, email_start.data)
        self.assertEqual(email_start.data["email_started"], True)
        self.assertEqual(email_start.data["mobile_started"], False)
        self.assertEqual(mail.outbox[-1].to, ["new-email@example.com"])
        send_sms.assert_not_called()

        email_otp = re.search(r"\b\d{6}\b", mail.outbox[-1].body).group()
        email_verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": email_start.data["challenge_id"],
                "channel": "email",
                "otp": email_otp,
            },
            format="json",
        )
        self.assertEqual(email_verified.status_code, 200, email_verified.data)
        self.assertTrue(email_verified.data["email_verified"])
        self.assertFalse(email_verified.data["mobile_verified"])

        mobile_start = self.client.post(
            "/api/registrations/verification/start/",
            {
                "channel": "mobile",
                "email": "existing@example.com",
                "phone": "9123456781",
            },
            format="json",
        )
        self.assertEqual(mobile_start.status_code, 200, mobile_start.data)
        self.assertEqual(mobile_start.data["email_started"], False)
        self.assertEqual(mobile_start.data["mobile_started"], True)
        send_sms.assert_called_once()
        self.assertEqual(send_sms.call_args.args[0], "9123456781")

        mobile_verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": mobile_start.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456781",
                "otp": send_sms.call_args.args[1],
            },
            format="json",
        )
        self.assertEqual(mobile_verified.status_code, 200, mobile_verified.data)
        self.assertTrue(mobile_verified.data["mobile_verified"])
        self.assertFalse(mobile_verified.data["email_verified"])

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    def test_channel_verifications_share_a_bound_registration_challenge(self, send_sms):
        email_start = self.client.post(
            "/api/registrations/verification/start/",
            {
                "channel": "email",
                "email": "combined@example.com",
            },
            format="json",
        )
        self.assertEqual(email_start.status_code, 200, email_start.data)

        mobile_start = self.client.post(
            "/api/registrations/verification/start/",
            {
                "channel": "mobile",
                "challenge_id": email_start.data["challenge_id"],
                "phone": "9123456782",
            },
            format="json",
        )
        self.assertEqual(mobile_start.status_code, 200, mobile_start.data)
        self.assertEqual(mobile_start.data["challenge_id"], email_start.data["challenge_id"])
        self.assertTrue(mobile_start.data["email_started"])
        self.assertTrue(mobile_start.data["mobile_started"])
        self.assertEqual(send_sms.call_args.args[0], "9123456782")

        email_verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": email_start.data["challenge_id"],
                "channel": "email",
                "otp": re.search(r"\b\d{6}\b", mail.outbox[-1].body).group(),
            },
            format="json",
        )
        mobile_verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": email_start.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456782",
                "otp": send_sms.call_args.args[1],
            },
            format="json",
        )

        self.assertEqual(email_verified.status_code, 200, email_verified.data)
        self.assertNotIn("verification_token", email_verified.data)
        self.assertEqual(mobile_verified.status_code, 200, mobile_verified.data)
        self.assertEqual(
            mobile_verified.data["verification_token"],
            email_start.data["challenge_id"],
        )

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    def test_email_resend_and_verification_do_not_allow_registration_without_sms(
        self, send_sms
    ):
        email = "email-only-registration@example.com"
        phone = "9123456783"
        start = self.client.post(
            "/api/registrations/verification/start/",
            {
                "channel": "email",
                "email": email,
                "phone": phone,
            },
            format="json",
        )
        self.assertEqual(start.status_code, 200, start.data)
        send_sms.assert_not_called()

        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        self.assertEqual(challenge.phone, phone)
        self.assertFalse(challenge.phone_verified)
        challenge.email_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["email_resend_after"])

        resend = self.client.post(
            "/api/registrations/verification/resend/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
            },
            format="json",
        )
        self.assertEqual(resend.status_code, 200, resend.data)
        self.assertEqual(mail.outbox[-1].to, [email])

        email_otp = re.search(r"\b\d{6}\b", mail.outbox[-1].body).group()
        verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
                "otp": email_otp,
            },
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertTrue(verified.data["email_verified"])
        self.assertFalse(verified.data["mobile_verified"])

        challenge.refresh_from_db()
        self.assertGreater(
            challenge.expires_at,
            timezone.now() + timedelta(
                seconds=settings.REGISTRATION_COMPLETION_TOKEN_SECONDS - 5
            ),
        )
        # The OTP itself may expire while the user fills in the remaining
        # registration steps; the verified completion token remains bounded.
        challenge.email_expires_at = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["email_expires_at"])

        with self.captureOnCommitCallbacks(execute=True):
            registration_response = self.client.post(
                "/api/registrations/",
                {
                    "full_name": "Email Only User",
                    "gender": "Female",
                    "date_of_birth": "1995-01-01",
                    "email": email,
                    "password": "pass123",
                    "phone": phone,
                    "verification_token": start.data["challenge_id"],
                },
                format="json",
            )
        self.assertEqual(registration_response.status_code, 400, registration_response.data)
        self.assertIn("mobile number", str(registration_response.data["verification_token"]).lower())
        self.assertFalse(User.objects.filter(email=email).exists())
        send_sms.assert_not_called()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        ADMIN_NOTIFICATION_EMAIL="admin@example.com",
        ADMIN_DASHBOARD_URL="https://matrimony.example.com",
    )
    def test_new_email_and_phone_are_accepted_and_email_is_normalized(self):
        with patch("registrations.views.send_mobile_otp", return_value="sent") as send_sms:
            start = self.client.post(
                "/api/registrations/verification/start/",
                {"email": "New.User@Example.com", "phone": "9123456780"},
                format="json",
            )
            self.assertEqual(start.status_code, 200, start.data)
            self.assertEqual(mail.outbox[0].from_email, "no-reply@example.com")
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
                    "phone": "9123456780",
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
        self.assertEqual(
            mail.outbox[1].subject,
            "Welcome to Keralakkara Matrimony!",
        )
        self.assertEqual(mail.outbox[1].from_email, "info@keralakkaramatrimony.com")
        self.assertEqual(mail.outbox[1].to, ["new.user@example.com"])
        self.assertIn("New User", mail.outbox[1].body)
        self.assertIn("registration was successful", mail.outbox[1].body)
        self.assertIn(registration.matrimony_id, mail.outbox[1].body)
        self.assertIn("If admin approval is required", mail.outbox[1].body)
        self.assertEqual(len([
            message for message in mail.outbox
            if message.subject == "Welcome to Keralakkara Matrimony!"
        ]), 1)
        self.assertEqual(len(mail.outbox[1].alternatives), 1)
        self.assertIn(registration.matrimony_id, mail.outbox[1].alternatives[0][0])
        self.assertEqual(mail.outbox[2].subject, "New Matrimony registration requires review")
        self.assertIn(f"/admin/view/{registration.pk}", mail.outbox[2].body)

    def test_registration_cannot_complete_without_email_verification(self):
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

    def test_registration_rejects_unverified_challenge_token(self):
        now = timezone.now()
        challenge = VerificationChallenge.objects.create(
            email="pending@example.com",
            phone="9123456780",
            email_otp_hash="not-used",
            phone_otp_hash="not-used",
            email_resend_after=now,
            phone_resend_after=now,
            email_expires_at=now + timedelta(minutes=5),
            phone_expires_at=now + timedelta(minutes=5),
            expires_at=now + timedelta(minutes=5),
        )

        response = self.client.post(
            "/api/registrations/",
            {
                "full_name": "Unverified User",
                "gender": "Male",
                "date_of_birth": "1994-01-01",
                "email": "pending@example.com",
                "password": "pass123",
                "phone": "9123456780",
                "verification_token": str(challenge.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("verification_token", response.data)
        self.assertFalse(User.objects.filter(email="pending@example.com").exists())

    def test_registration_rejects_expired_verified_challenge(self):
        now = timezone.now()
        challenge = VerificationChallenge.objects.create(
            email="expired@example.com",
            phone="9123456780",
            email_otp_hash="not-used",
            phone_otp_hash="not-used",
            email_verified=True,
            email_resend_after=now,
            phone_resend_after=now,
            email_expires_at=now - timedelta(seconds=1),
            phone_expires_at=now - timedelta(seconds=1),
            expires_at=now - timedelta(seconds=1),
        )

        response = self.client.post(
            "/api/registrations/",
            {
                "full_name": "Expired User",
                "gender": "Male",
                "date_of_birth": "1994-01-01",
                "email": "expired@example.com",
                "password": "pass123",
                "phone": "9123456780",
                "verification_token": str(challenge.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("expired", str(response.data["verification_token"]).lower())
        self.assertFalse(User.objects.filter(email="expired@example.com").exists())

    def test_registration_verification_token_is_bound_to_both_contacts(self):
        now = timezone.now()
        challenge = VerificationChallenge.objects.create(
            email="verified@example.com",
            phone="9123456780",
            email_otp_hash="not-used",
            phone_otp_hash="not-used",
            email_verified=True,
            phone_verified=True,
            email_resend_after=now,
            phone_resend_after=now,
            email_expires_at=now + timedelta(minutes=5),
            phone_expires_at=now + timedelta(minutes=5),
            expires_at=now + timedelta(minutes=5),
        )

        for email, phone in (
            ("different@example.com", "9123456780"),
            ("verified@example.com", "9123456781"),
        ):
            response = self.client.post(
                "/api/registrations/",
                {
                    "full_name": "Mismatched User",
                    "gender": "Male",
                    "date_of_birth": "1994-01-01",
                    "email": email,
                    "password": "pass123",
                    "phone": phone,
                    "verification_token": str(challenge.pk),
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("verification_token", response.data)

        self.assertFalse(User.objects.filter(email="different@example.com").exists())
        self.assertFalse(User.objects.filter(email="verified@example.com").exists())
        challenge.refresh_from_db()
        self.assertIsNone(challenge.consumed_at)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_MAX_ATTEMPTS=2,
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
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

        for attempt in range(2):
            response = self.client.post(
                "/api/registrations/verification/verify/",
                {
                    "challenge_id": start.data["challenge_id"],
                    "channel": "mobile",
                    "phone": "9123456780",
                    "otp": "000000" if mobile_otp != "000000" else "000001",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["attempts_remaining"], 1 - attempt)

        mobile_blocked = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456780",
                "otp": mobile_otp,
            },
            format="json",
        )
        self.assertEqual(mobile_blocked.status_code, 429)
        challenge.phone_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["phone_resend_after"])
        mobile_resend_blocked = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "mobile"},
            format="json",
        )
        self.assertEqual(mobile_resend_blocked.status_code, 429)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_RESEND_COOLDOWN_SECONDS=60,
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
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
    @patch("registrations.views._new_otp", side_effect=["111111", "222222", "333333"])
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    def test_email_resend_invalidates_the_old_code_and_accepts_the_new_code(
        self, send_sms, _new_otp
    ):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "email-resend@example.com", "phone": "9123456780"},
            format="json",
        )
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        challenge.email_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["email_resend_after"])

        resent = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "email"},
            format="json",
        )
        self.assertEqual(resent.status_code, 200, resent.data)
        self.assertEqual(re.search(r"\b\d{6}\b", mail.outbox[-1].body).group(), "333333")

        old_code = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
                "otp": "111111",
            },
            format="json",
        )
        new_code = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
                "otp": "333333",
            },
            format="json",
        )

        self.assertEqual(old_code.status_code, 400)
        self.assertEqual(new_code.status_code, 200, new_code.data)
        self.assertNotIn("333333", json.dumps(resent.data))
        send_sms.assert_called_once()

    @override_settings(
        DEBUG=False,
        MOBILE_OTP_MODE="console",
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    @patch("registrations.views._new_otp", side_effect=["111111", "222222", "333333"])
    def test_mobile_resend_invalidates_the_old_code_and_accepts_the_new_code(
        self, _new_otp, send_sms
    ):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "mobile-resend@example.com", "phone": "9123456780"},
            format="json",
        )
        self.assertEqual(start.status_code, 200, start.data)
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        challenge.phone_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["phone_resend_after"])

        resent = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "mobile"},
            format="json",
        )
        self.assertEqual(resent.status_code, 200, resent.data)
        self.assertNotIn("333333", json.dumps(resent.data))

        old_code = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456780",
                "otp": "222222",
            },
            format="json",
        )
        new_code = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456780",
                "otp": "333333",
            },
            format="json",
        )

        self.assertEqual(old_code.status_code, 400)
        self.assertEqual(new_code.status_code, 200, new_code.data)
        self.assertNotIn("333333", json.dumps(resent.data))
        self.assertEqual(send_sms.call_count, 2)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_RESEND_COOLDOWN_SECONDS=60,
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    @patch("registrations.views.send_email_otp")
    def test_resend_delivery_failure_preserves_code_and_enforces_cooldown(
        self, send_email, send_sms
    ):
        send_email.side_effect = [
            None,
            VerificationDeliveryError("SMTP unavailable"),
        ]
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "resend-failure@example.com", "phone": "9123456780"},
            format="json",
        )
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        original_hash = challenge.email_otp_hash
        challenge.email_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["email_resend_after"])

        failed = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "email"},
            format="json",
        )

        self.assertEqual(failed.status_code, 503)
        self.assertEqual(failed.data["detail"], "SMTP unavailable")
        self.assertEqual(failed.data["resend_after"], 60)
        challenge.refresh_from_db()
        self.assertEqual(challenge.email_otp_hash, original_hash)
        self.assertGreater(challenge.email_resend_after, timezone.now())
        send_sms.assert_called_once()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    def test_resend_rejects_an_expired_challenge(self, send_sms):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "expired-resend@example.com", "phone": "9123456780"},
            format="json",
        )
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        expired_at = timezone.now() - timedelta(seconds=1)
        challenge.expires_at = expired_at
        challenge.email_expires_at = expired_at
        challenge.phone_expires_at = expired_at
        challenge.save(update_fields=["expires_at", "email_expires_at", "phone_expires_at"])

        resent = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "email"},
            format="json",
        )

        self.assertEqual(resent.status_code, 400)
        self.assertIn("expired", resent.data["detail"].lower())
        verify = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
                "otp": "123456",
            },
            format="json",
        )
        self.assertEqual(verify.status_code, 400)
        self.assertIn("expired", verify.data["detail"].lower())
        send_sms.assert_called_once()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        DEBUG=False,
        MOBILE_OTP_MODE="console",
    )
    @patch("registrations.views._new_otp", side_effect=["111111", "222222", "333333", "444444"])
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    def test_restored_challenge_can_resend_both_codes(
        self, send_sms, _new_otp
    ):
        start = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "restore-resend@example.com", "phone": "9123456780"},
            format="json",
        )
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        challenge.email_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.phone_resend_after = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["email_resend_after", "phone_resend_after"])

        restored = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "restore-resend@example.com", "phone": "9123456780"},
            format="json",
        )
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data["challenge_id"], start.data["challenge_id"])
        self.assertTrue(restored.data["verification_in_progress"])
        self.assertEqual(restored.data["mobile_delivery"], "restored")

        email_resend = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "email"},
            format="json",
        )
        mobile_resend = self.client.post(
            "/api/registrations/verification/resend/",
            {"challenge_id": start.data["challenge_id"], "channel": "mobile"},
            format="json",
        )

        self.assertEqual(email_resend.status_code, 200, email_resend.data)
        self.assertEqual(mobile_resend.status_code, 200, mobile_resend.data)
        self.assertEqual(re.search(r"\b\d{6}\b", mail.outbox[-1].body).group(), "333333")
        self.assertEqual(send_sms.call_args_list[-1].args[1], "444444")

        email_verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "email",
                "otp": "333333",
            },
            format="json",
        )
        mobile_verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": start.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456780",
                "otp": "444444",
            },
            format="json",
        )
        self.assertEqual(email_verified.status_code, 200, email_verified.data)
        self.assertEqual(mobile_verified.status_code, 200, mobile_verified.data)
        self.assertIn("verification_token", mobile_verified.data)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
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
        self.assertEqual(
            response.data["delivery_errors"],
            [{"channel": "mobile", "detail": "SMS provider unavailable"}],
        )
        self.assertTrue(
            VerificationChallenge.objects.filter(
                email="sms-failure@example.com",
                consumed_at__isnull=False,
            ).exists()
        )
        send_sms.assert_called_once()

    @override_settings(
        DEBUG=False,
        MOBILE_OTP_MODE="console",
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_EXPIRY_SECONDS=600,
        OTP_RESEND_COOLDOWN_SECONDS=60,
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    @patch("registrations.views._new_otp", side_effect=["111111", "222222"])
    def test_mobile_code_is_hashed_phone_bound_and_single_use(self, _new_otp, send_sms):
        response = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "development-otp@example.com", "phone": "9123456780"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertGreater(response.data["expires_in"], 0)
        self.assertLessEqual(response.data["expires_in"], 600)
        self.assertEqual(response.data["mobile_delivery"], "sent")
        self.assertNotIn("111111", json.dumps(response.data))
        self.assertNotIn("222222", json.dumps(response.data))
        send_sms.assert_called_once_with("9123456780", "222222")

        challenge = VerificationChallenge.objects.get(pk=response.data["challenge_id"])
        self.assertTrue(check_password("222222", challenge.phone_otp_hash))
        self.assertNotEqual(challenge.phone_otp_hash, "222222")
        self.assertLessEqual(
            abs((challenge.expires_at - challenge.created_at).total_seconds() - 600),
            3,
        )

        missing_phone = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": response.data["challenge_id"],
                "channel": "mobile",
                "otp": "222222",
            },
            format="json",
        )
        self.assertEqual(missing_phone.status_code, 400)

        wrong_phone = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": response.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456781",
                "otp": "222222",
            },
            format="json",
        )
        self.assertEqual(wrong_phone.status_code, 400)
        self.assertFalse(VerificationChallenge.objects.get(pk=challenge.pk).phone_verified)

        verified = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": response.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456780",
                "otp": "222222",
            },
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertTrue(verified.data["mobile_verified"])

        reused = self.client.post(
            "/api/registrations/verification/verify/",
            {
                "challenge_id": response.data["challenge_id"],
                "channel": "mobile",
                "phone": "9123456780",
                "otp": "222222",
            },
            format="json",
        )
        self.assertEqual(reused.status_code, 400)
        self.assertIn("already been used", reused.data["detail"])

    @override_settings(
        DEBUG=False,
        MOBILE_OTP_MODE="console",
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        OTP_EXPIRY_SECONDS=600,
    )
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    @patch("registrations.views._new_otp", side_effect=["333333", "444444"])
    def test_mobile_code_expires_after_ten_minutes(self, _new_otp, send_sms):
        started_at = timezone.now()
        with patch("registrations.views.timezone.now", return_value=started_at):
            start = self.client.post(
                "/api/registrations/verification/start/",
                {"email": "expiry-otp@example.com", "phone": "9123456780"},
                format="json",
            )
        self.assertEqual(start.status_code, 200, start.data)
        challenge = VerificationChallenge.objects.get(pk=start.data["challenge_id"])
        self.assertEqual(
            (challenge.expires_at - started_at).total_seconds(),
            600,
        )

        with patch(
            "registrations.views.timezone.now",
            return_value=started_at + timedelta(minutes=10, seconds=1),
        ):
            expired = self.client.post(
                "/api/registrations/verification/verify/",
                {
                    "challenge_id": start.data["challenge_id"],
                    "channel": "mobile",
                    "phone": "9123456780",
                    "otp": "444444",
                },
                format="json",
            )
        self.assertEqual(expired.status_code, 400)
        self.assertIn("expired", expired.data["detail"].lower())

    @override_settings(
        DEBUG=False,
        MOBILE_OTP_MODE="disabled",
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
        GENOVA_SMS_ACCESS_TOKEN="",
        GENOVA_SMS_ACCESS_TOKEN_KEY="",
    )
    @patch("registrations.views._new_otp", side_effect=["555555", "666666"])
    @patch("registrations.views.send_email_otp")
    def test_mobile_delivery_fails_closed_without_genova_credentials(
        self, send_email, _new_otp
    ):
        with self.assertLogs("registrations.views", level="WARNING") as logs:
            response = self.client.post(
                "/api/registrations/verification/start/",
                {"email": "production-otp@example.com", "phone": "9123456780"},
                format="json",
            )

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("666666", json.dumps(response.data))
        self.assertNotIn("666666", "\n".join(logs.output))
        challenge = VerificationChallenge.objects.get(
            email="production-otp@example.com"
        )
        self.assertIsNotNone(challenge.consumed_at)
        send_email.assert_called_once()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        EMAIL_HOST="",
        EMAIL_HOST_USER="",
        EMAIL_HOST_PASSWORD="",
        DEFAULT_FROM_EMAIL="",
    )
    def test_missing_email_delivery_settings_are_reported_without_secrets(self):
        response = self.client.post(
            "/api/registrations/verification/start/",
            {"email": "email-config@example.com", "phone": "9123456780"},
            format="json",
        )
        self.assertEqual(response.status_code, 503)
        email_error = next(
            item
            for item in response.data["delivery_errors"]
            if item["channel"] == "email"
        )
        self.assertIn("EMAIL_HOST", email_error["detail"])
        self.assertIn("EMAIL_HOST_PASSWORD", email_error["detail"])
        self.assertNotIn("failed_channels", response.data)

    @override_settings(
        IS_RAILWAY=True,
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_key",
        DEFAULT_FROM_EMAIL="verified@example.com",
    )
    @patch("registrations.verification.send_mail", return_value=1)
    def test_resend_email_backend_is_allowed_on_railway(self, send_mail_mock):
        delivery = send_email_otp("recipient@example.com", "123456")

        self.assertEqual(delivery, "sent")
        send_mail_mock.assert_called_once()

    @override_settings(
        IS_RAILWAY=True,
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="",
        DEFAULT_FROM_EMAIL="",
    )
    def test_resend_reports_missing_api_key_and_sender(self):
        with self.assertRaises(VerificationDeliveryError) as error:
            send_email_otp("recipient@example.com", "123456")

        self.assertIn("RESEND_API_KEY", str(error.exception))
        self.assertIn("DEFAULT_FROM_EMAIL", str(error.exception))

    @override_settings(
        DEBUG=False,
        MOBILE_OTP_MODE="console",
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        EMAIL_HOST="smtp.gmail.com",
        EMAIL_PORT=587,
        EMAIL_USE_TLS=True,
        EMAIL_USE_SSL=False,
        EMAIL_HOST_USER="private.sender@example.com",
        EMAIL_HOST_PASSWORD="private-app-password",
        DEFAULT_FROM_EMAIL="private.sender@example.com",
    )
    @patch("registrations.views._new_otp", side_effect=["135790", "246801"])
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    @patch(
        "registrations.verification.send_mail",
        side_effect=smtplib.SMTPAuthenticationError(
            535,
            b"Authentication rejected private.sender@example.com private-app-password 135790",
        ),
    )
    def test_smtp_failure_is_logged_with_redacted_diagnostic(
        self, send_mail_mock, send_mobile, _new_otp
    ):
        with self.assertLogs("registrations.verification", level="ERROR") as logs:
            response = self.client.post(
                "/api/registrations/verification/start/",
                {"email": "recipient@example.com", "phone": "9123456780"},
                format="json",
            )

        log_output = "\n".join(logs.output)
        self.assertEqual(response.status_code, 503)
        self.assertIn("SMTPAuthenticationError", log_output)
        self.assertIn("smtp_code=535", log_output)
        for secret in (
            "private.sender@example.com",
            "private-app-password",
            "135790",
            "recipient@example.com",
        ):
            self.assertNotIn(secret, log_output)
            self.assertNotIn(secret, json.dumps(response.data))
        email_error = next(
            item
            for item in response.data["delivery_errors"]
            if item["channel"] == "email"
        )
        self.assertIn("could not be sent", email_error["detail"])
        send_mail_mock.assert_called_once()
        send_mobile.assert_called_once()

    @override_settings(
        DEBUG=False,
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_secret_key",
        DEFAULT_FROM_EMAIL="onboarding@resend.dev",
    )
    @patch("registrations.views._new_otp", side_effect=["135790", "246801"])
    @patch("registrations.views.send_mobile_otp", return_value="sent")
    @patch(
        "registrations.verification.send_mail",
        side_effect=AnymailError(
            "You can only send testing emails to your own email address; "
            "recipient@example.com code 135790 key re_test_secret_key",
            status_code=403,
            response=Mock(
                reason="Forbidden",
                json=Mock(return_value={
                    "message": "You can only send testing emails to your own "
                    "email address: recipient@example.com code 135790 key "
                    "re_test_secret_key"
                }),
            ),
        ),
    )
    def test_resend_recipient_restriction_surfaces_in_safe_logs_via_registration(
        self, send_mail_mock, send_mobile, _new_otp
    ):
        with self.assertLogs("registrations.verification", level="ERROR") as logs:
            response = self.client.post(
                "/api/registrations/verification/start/",
                {"email": "recipient@example.com", "phone": "9123456780"},
                format="json",
            )

        log_output = "\n".join(logs.output)
        response_json = json.dumps(response.data)
        self.assertEqual(response.status_code, 503)
        self.assertIn("http_status=403", log_output)
        self.assertIn("only send testing emails", log_output)
        for secret in (
            "recipient@example.com",
            "135790",
            "re_test_secret_key",
        ):
            self.assertNotIn(secret, log_output)
            self.assertNotIn(secret, response_json)
        self.assertIn("could not be sent", response_json)
        send_mail_mock.assert_called_once()
        send_mobile.assert_called_once()


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
        self.assertEqual(self.registration.about, "Before partial update")
        self.assertEqual(self.registration.full_name, "API Test User")
        self.assertEqual(partial_update.data["status"], "UNDER_REVIEW")
        self.assertEqual(
            partial_update.data["pending_data"]["about"],
            "Updated without replacing other fields",
        )

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
        self.assertFalse(self.registration.profile_photo)
        self.assertTrue(image_update.data["pending_profile_photo_url"])
        self.assertEqual(self.registration.about, "Before partial update")
        self.assertEqual(
            image_update.data["pending_data"]["about"],
            "Updated without replacing other fields",
        )

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
        self.assertEqual(upload_response.data["status"], "UNDER_REVIEW")
        self.assertIn(
            "/pending-files/horoscope-file/",
            upload_response.data["horoscope_file_url"],
        )
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.horoscope_file)

        profile_response = self.client.get("/api/registrations/my-profile/")
        self.assertEqual(profile_response.status_code, 200, profile_response.data)
        self.assertTrue(profile_response.data["pending_horoscope_file_url"])

        file_response = self.client.get(profile_response.data["pending_horoscope_file_url"])
        self.assertEqual(file_response.status_code, 200)
        self.assertEqual(file_response["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(file_response.streaming_content).startswith(b"\xff\xd8"))
        file_response.close()

        delete_response = self.client.delete(endpoint)
        self.assertEqual(delete_response.status_code, 200, delete_response.data)
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.horoscope_file)
        self.assertEqual(delete_response.data["status"], Registration.Status.PENDING)

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


class EmailVerifiedPersistenceTests(TestCase):
    def setUp(self):
        now = timezone.now()
        future = now + timedelta(hours=1)
        self.challenge = VerificationChallenge.objects.create(
            email="ev-persist@example.com",
            phone="+919988776655",
            email_otp_hash="x",
            phone_otp_hash="x",
            email_verified=True,
            phone_verified=True,
            email_resend_after=future,
            phone_resend_after=future,
            email_expires_at=future,
            phone_expires_at=future,
            expires_at=future,
        )

    def _register(self):
        s = RegistrationSerializer(data={
            "full_name": "Persist Test",
            "gender": "Male",
            "date_of_birth": "1993-03-03",
            "phone": "+919988776655",
            "email": "ev-persist@example.com",
            "password": "testpass123",
            "verification_token": str(self.challenge.pk),
        })
        self.assertTrue(s.is_valid(), s.errors)
        return s.save()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_email_verified_is_true_after_registration(self):
        with self.captureOnCommitCallbacks(execute=False):
            reg = self._register()
        self.assertTrue(reg.email_verified)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_phone_verified_is_true_after_registration(self):
        with self.captureOnCommitCallbacks(execute=False):
            reg = self._register()
        self.assertTrue(reg.phone_verified)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_both_verified_flags_persist_in_database(self):
        with self.captureOnCommitCallbacks(execute=False):
            reg = self._register()
        reg.refresh_from_db()
        self.assertTrue(reg.email_verified)
        self.assertTrue(reg.phone_verified)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="no-reply@example.com",
    )
    def test_email_verified_false_when_challenge_not_email_verified(self):
        self.challenge.email_verified = False
        self.challenge.save(update_fields=["email_verified"])
        s = RegistrationSerializer(data={
            "full_name": "Unverified Email",
            "gender": "Male",
            "date_of_birth": "1993-03-03",
            "phone": "+919988776655",
            "email": "ev-persist@example.com",
            "password": "testpass123",
            "verification_token": str(self.challenge.pk),
        })
        self.assertTrue(s.is_valid(), s.errors)
        with self.assertRaises(Exception):
            s.save()
        self.assertFalse(User.objects.filter(email="ev-persist@example.com").exists())
