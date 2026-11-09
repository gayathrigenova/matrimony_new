import hashlib
import hmac
import os
from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from registrations.models import Registration

from .models import ContactCreditBalance, ContactUnlock, RazorpayOrder


User = get_user_model()


class MembershipContactCreditTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            email="member@example.com",
            password="test-password",
        )
        Registration.objects.create(
            user=self.member,
            full_name="Contact Credit Member",
            gender="Male",
            date_of_birth=date(1998, 1, 1),
        )
        self.profile_owner = User.objects.create_user(
            email="profile@example.com",
            password="test-password",
        )
        self.profile = Registration.objects.create(
            user=self.profile_owner,
            full_name="Published Member",
            gender="Female",
            date_of_birth=date(2000, 1, 1),
            status=Registration.Status.PUBLISHED,
            phone="9876543210",
        )
        self.client.force_authenticate(self.member)

    def test_credit_balance_is_persisted_after_verified_purchase(self):
        order = RazorpayOrder.objects.create(
            user=self.member,
            provider_order_id="order_contact_test",
            amount=149900,
        )
        payment_id = "pay_contact_test"
        secret = "test-razorpay-secret"
        signature = hmac.new(
            secret.encode(),
            f"{order.provider_order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        payload = {
            "razorpay_order_id": order.provider_order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        }
        captured_payment = {
            "id": payment_id,
            "order_id": order.provider_order_id,
            "amount": 149900,
            "currency": "INR",
            "status": "captured",
        }

        with patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test-key",
            "RAZORPAY_KEY_SECRET": secret,
        }), patch(
            "memberships.views._razorpay_request",
            return_value=captured_payment,
        ):
            first_response = self.client.post(
                reverse("razorpay-payment-verify"),
                payload,
                format="json",
            )
            duplicate_response = self.client.post(
                reverse("razorpay-payment-verify"),
                payload,
                format="json",
            )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(first_response.data["contacts_remaining"], 20)
        self.assertEqual(duplicate_response.status_code, status.HTTP_200_OK)
        self.assertEqual(duplicate_response.data["contacts_remaining"], 20)
        balance = ContactCreditBalance.objects.get(user=self.member)
        self.assertEqual(balance.remaining_contacts, 20)
        self.assertEqual(balance.total_contacts_purchased, 20)

    def test_contact_unlock_consumes_one_credit_once_and_persists(self):
        ContactCreditBalance.objects.create(
            user=self.member,
            remaining_contacts=20,
            total_contacts_purchased=20,
        )

        first_response = self.client.post(
            reverse("contact-unlock", args=[self.profile.pk]),
        )
        repeated_response = self.client.post(
            reverse("contact-unlock", args=[self.profile.pk]),
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(first_response.data["contact"]["phone"], "9876543210")
        self.assertEqual(first_response.data["contact"]["email"], "profile@example.com")
        self.assertEqual(first_response.data["contacts_remaining"], 19)
        self.assertTrue(repeated_response.data["already_unlocked"])
        self.assertEqual(repeated_response.data["contacts_remaining"], 19)
        self.assertEqual(ContactUnlock.objects.count(), 1)

        self.client.force_authenticate(self.member)
        profile_response = self.client.get(reverse("my-profile"))
        self.assertEqual(profile_response.data["contacts_remaining"], 19)

    def test_contact_unlock_requires_credit(self):
        response = self.client.post(
            reverse("contact-unlock", args=[self.profile.pk]),
        )

        self.assertEqual(response.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertEqual(ContactUnlock.objects.count(), 0)
