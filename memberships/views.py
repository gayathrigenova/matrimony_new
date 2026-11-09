import base64
import hashlib
import hmac
import json
import logging
import os
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from registrations.models import Registration

from .models import ContactCreditBalance, ContactUnlock, RazorpayOrder


logger = logging.getLogger(__name__)
User = get_user_model()

GOLD_PLAN_AMOUNT = 149900
GOLD_PLAN_CONTACTS = 20
RAZORPAY_API_URL = "https://api.razorpay.com/v1"


class PaymentServiceUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Payments are temporarily unavailable. Please try again later."
    default_code = "payment_service_unavailable"


class RazorpayVerificationSerializer(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=100)
    razorpay_payment_id = serializers.RegexField(r"^[A-Za-z0-9_]+$", max_length=100)
    razorpay_signature = serializers.RegexField(r"^[A-Fa-f0-9]{64}$", max_length=64)


def _razorpay_credentials():
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not key_secret:
        raise PaymentServiceUnavailable()
    return key_id, key_secret


def _razorpay_request(method, path, payload=None):
    key_id, key_secret = _razorpay_credentials()
    credentials = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        f"{RAZORPAY_API_URL}{path}",
        data=body,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read())
    except HTTPError as error:
        logger.warning("Razorpay request failed with HTTP %s.", error.code)
        raise PaymentServiceUnavailable() from None
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        logger.warning("Razorpay request failed: %s.", type(error).__name__)
        raise PaymentServiceUnavailable() from None

    if not isinstance(data, dict):
        raise PaymentServiceUnavailable()
    return data


def _get_or_create_balance(user):
    User.objects.select_for_update().get(pk=user.pk)
    ContactCreditBalance.objects.get_or_create(user=user)
    return ContactCreditBalance.objects.select_for_update().get(user=user)


def _mark_order_paid(order, payment_id):
    with transaction.atomic():
        order = RazorpayOrder.objects.select_for_update().get(pk=order.pk)
        if order.status == RazorpayOrder.Status.PAID:
            if order.payment_id != payment_id:
                raise serializers.ValidationError(
                    {"detail": "This order has already been confirmed with another payment."}
                )
            balance = _get_or_create_balance(order.user)
            return balance

        order.status = RazorpayOrder.Status.PAID
        order.payment_id = payment_id
        order.paid_at = timezone.now()
        order.save(update_fields=["status", "payment_id", "paid_at"])

        balance = _get_or_create_balance(order.user)
        balance.remaining_contacts += GOLD_PLAN_CONTACTS
        balance.total_contacts_purchased += GOLD_PLAN_CONTACTS
        balance.save(update_fields=[
            "remaining_contacts",
            "total_contacts_purchased",
            "updated_at",
        ])
        return balance


def _payment_matches_order(payment, order, expected_payment_id=None):
    payment_id = payment.get("id")
    return (
        isinstance(payment_id, str)
        and payment_id.startswith("pay_")
        and (expected_payment_id is None or payment_id == expected_payment_id)
        and payment.get("order_id") == order.provider_order_id
        and payment.get("amount") == order.amount == GOLD_PLAN_AMOUNT
        and payment.get("currency") == order.currency == "INR"
        and payment.get("status") == "captured"
    )


def _contact_data(profile):
    return {
        "email": profile.user.email,
        "phone": profile.phone,
        "alternate_phone": profile.alternate_phone,
        "contact_name": profile.contact_name,
        "relationship": profile.relationship,
        "contact_phone": profile.contact_phone,
        "country_code": profile.country_code,
        "extra_phone": profile.extra_phone,
    }


class ClientMembershipView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role != "CLIENT":
            raise PermissionDenied("Only members can manage contact credits.")


class ContactCreditBalanceView(ClientMembershipView):
    def get(self, request):
        balance = ContactCreditBalance.objects.filter(user=request.user).first()
        return Response({
            "contacts_remaining": balance.remaining_contacts if balance else 0,
            "contacts_purchased": balance.total_contacts_purchased if balance else 0,
        })


class RazorpayOrderCreateView(ClientMembershipView):
    def post(self, request):
        key_id, _ = _razorpay_credentials()
        receipt = f"cc-{uuid.uuid4().hex}"
        provider_order = _razorpay_request("POST", "/orders", {
            "amount": GOLD_PLAN_AMOUNT,
            "currency": "INR",
            "receipt": receipt,
            "notes": {
                "user_id": str(request.user.pk),
                "plan": "gold_contacts_20",
            },
        })
        provider_order_id = provider_order.get("id")
        if (
            not isinstance(provider_order_id, str)
            or not provider_order_id.startswith("order_")
            or provider_order.get("amount") != GOLD_PLAN_AMOUNT
            or provider_order.get("currency") != "INR"
        ):
            logger.error("Razorpay returned an invalid membership order.")
            raise PaymentServiceUnavailable()

        RazorpayOrder.objects.create(
            user=request.user,
            provider_order_id=provider_order_id,
            amount=GOLD_PLAN_AMOUNT,
            currency="INR",
        )
        return Response({
            "key_id": key_id,
            "order_id": provider_order_id,
            "amount": GOLD_PLAN_AMOUNT,
            "currency": "INR",
        }, status=status.HTTP_201_CREATED)


class RazorpayPaymentVerifyView(ClientMembershipView):
    def post(self, request):
        serializer = RazorpayVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data

        order = RazorpayOrder.objects.filter(
            provider_order_id=values["razorpay_order_id"],
            user=request.user,
        ).first()
        if not order:
            raise NotFound("Membership order not found.")

        _, key_secret = _razorpay_credentials()
        signed_payload = (
            f"{order.provider_order_id}|{values['razorpay_payment_id']}"
        ).encode()
        expected_signature = hmac.new(
            key_secret.encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(
            expected_signature,
            values["razorpay_signature"],
        ):
            raise serializers.ValidationError(
                {"detail": "The payment signature could not be verified."}
            )

        payment = _razorpay_request(
            "GET",
            f"/payments/{values['razorpay_payment_id']}",
        )
        if not _payment_matches_order(
            payment,
            order,
            values["razorpay_payment_id"],
        ):
            raise serializers.ValidationError(
                {"detail": "The payment has not been captured for this membership order."}
            )

        balance = _mark_order_paid(order, values["razorpay_payment_id"])
        return Response({
            "message": "Gold membership activated. 20 contact credits were added.",
            "contacts_remaining": balance.remaining_contacts,
            "contacts_purchased": balance.total_contacts_purchased,
        })


class RazorpayWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
        if not webhook_secret:
            raise PaymentServiceUnavailable()

        signature = request.headers.get("X-Razorpay-Signature", "")
        expected_signature = hmac.new(
            webhook_secret.encode(),
            request.body,
            hashlib.sha256,
        ).hexdigest()
        if not signature or not hmac.compare_digest(expected_signature, signature):
            return Response(
                {"detail": "Invalid webhook signature."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            event = json.loads(request.body)
        except json.JSONDecodeError:
            return Response(
                {"detail": "Invalid webhook payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(event, dict) or event.get("event") != "payment.captured":
            return Response({"message": "Event ignored."})

        payload = event.get("payload")
        payment_payload = payload.get("payment") if isinstance(payload, dict) else None
        payment = payment_payload.get("entity") if isinstance(payment_payload, dict) else None
        if not isinstance(payment, dict):
            return Response(
                {"detail": "Invalid captured payment payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        provider_order_id = payment.get("order_id")
        order = RazorpayOrder.objects.filter(
            provider_order_id=provider_order_id,
        ).first()
        if not order:
            return Response({"message": "Membership order not found."})
        if not _payment_matches_order(payment, order):
            logger.warning(
                "Razorpay capture did not match membership order %s.",
                order.provider_order_id,
            )
            return Response(
                {"detail": "Captured payment does not match the membership order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _mark_order_paid(order, payment["id"])
        return Response({"message": "Payment recorded."})


class ContactUnlockView(ClientMembershipView):
    def post(self, request, profile_id):
        profile = Registration.objects.select_related("user").filter(
            pk=profile_id,
            status=Registration.Status.PUBLISHED,
        ).first()
        if not profile:
            raise NotFound("Published profile not found.")
        if profile.user_id == request.user.pk:
            raise serializers.ValidationError(
                {"detail": "You cannot unlock your own contact details."}
            )

        with transaction.atomic():
            balance = _get_or_create_balance(request.user)
            unlock = ContactUnlock.objects.filter(
                viewer=request.user,
                profile=profile,
            ).first()
            if not unlock:
                if balance.remaining_contacts < 1:
                    return Response(
                        {
                            "detail": "You have no contact credits remaining.",
                            "contacts_remaining": 0,
                            "membership_url": "/membership",
                        },
                        status=status.HTTP_402_PAYMENT_REQUIRED,
                    )
                ContactUnlock.objects.create(
                    viewer=request.user,
                    profile=profile,
                )
                balance.remaining_contacts -= 1
                balance.save(update_fields=["remaining_contacts", "updated_at"])

        return Response({
            "contact": _contact_data(profile),
            "contacts_remaining": balance.remaining_contacts,
            "already_unlocked": unlock is not None,
        })
