from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="noreply@keralakkaramatrimony.com",
)
class ContactEnquiryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {
            "name": "A Visitor",
            "phone": "+91 755 908 0005",
            "email": "visitor@example.com",
            "subject": "Membership question",
            "message": "Please tell me about memberships.",
        }

    def test_contact_form_sends_all_fields_and_sets_reply_to(self):
        response = self.client.post(
            "/api/enquiries/contact/",
            self.payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["keralakkaramatrimony@gmail.com"])
        self.assertEqual(message.reply_to, ["visitor@example.com"])
        for value in self.payload.values():
            self.assertIn(value, message.body)

    def test_contact_form_requires_all_fields(self):
        payload = {key: value for key, value in self.payload.items() if key != "email"}

        response = self.client.post(
            "/api/enquiries/contact/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    @patch("enquiries.views.EmailMessage.send", side_effect=OSError("provider unavailable"))
    def test_contact_form_returns_friendly_error_if_delivery_fails(self, _send):
        response = self.client.post(
            "/api/enquiries/contact/",
            self.payload,
            format="json",
        )

        self.assertEqual(response.status_code, 503)
        self.assertIn("Please try again", response.data["detail"])
