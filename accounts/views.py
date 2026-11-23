import hashlib
import logging
import smtplib
from urllib.parse import urljoin

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMultiAlternatives
from django.db import models, transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from rest_framework_simplejwt.tokens import RefreshToken

from .password_reset import PasswordResetToken
from .serializers import (
    DeleteAccountSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
)
from notifications.emailing import notify_profile_update, safe_email_error
from adminpanel.models import ProfileChange, ProfileVerification
from registrations.models import ClientPhoto, Registration, VerificationChallenge


logger = logging.getLogger(__name__)
User = get_user_model()
PASSWORD_RESET_MESSAGE = (
    "If an account exists with this email, a password reset link has been sent."
)
INVALID_RESET_LINK_MESSAGE = "This password reset link is invalid or has expired."


def _account_file_querysets(user_id=None):
    if user_id is None:
        return [
            (Registration, Registration.objects.all()),
            (ClientPhoto, ClientPhoto.objects.all()),
            (ProfileChange, ProfileChange.objects.all()),
        ]

    return [
        (Registration, Registration.objects.filter(user_id=user_id)),
        (ClientPhoto, ClientPhoto.objects.filter(registration__user_id=user_id)),
        (
            ProfileChange,
            ProfileChange.objects.filter(
                Q(user_id=user_id) | Q(registration__user_id=user_id)
            ).distinct(),
        ),
    ]


def _file_references(querysets):
    references = {}
    for model, queryset in querysets:
        for field in model._meta.get_fields():
            if not isinstance(field, models.FileField):
                continue
            file_names = (
                queryset
                .filter(**{f"{field.name}__isnull": False})
                .exclude(**{field.name: ""})
                .values_list(field.name, flat=True)
            )
            for name in file_names:
                references[(id(field.storage), name)] = (field.storage, name)
    return references


def _delete_unreferenced_account_files(stored_files):
    remaining_files = _file_references(_account_file_querysets())
    for key, (storage, name) in stored_files.items():
        if key not in remaining_files:
            storage.delete(name)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.validated_data["user"]
            refresh = RefreshToken.for_user(user)

            return Response({
                "message": "Login successful",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                }
            }, status=status.HTTP_200_OK)

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        if not isinstance(request.data, dict):
            return Response(
                {"detail": "A valid email address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"],
            is_active=True,
        ).first()
        if user:
            raw_token = PasswordResetToken.generate_for_user(user)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            uid = urlsafe_base64_encode(force_str(user.pk).encode())
            frontend_url = settings.FRONTEND_URL
            reset_url = urljoin(
                f"{frontend_url}/",
                f"reset-password/{uid}/{raw_token}",
            )

            try:
                context = {
                    "full_name": user.full_name or "there",
                    "reset_url": reset_url,
                    "expiry_minutes": PasswordResetToken.EXPIRY_MINUTES,
                }
                message = EmailMultiAlternatives(
                    subject="Reset your Matrimony password",
                    body=render_to_string(
                        "accounts/password_reset_email.txt",
                        context,
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[user.email],
                )
                message.attach_alternative(
                    render_to_string(
                        "accounts/password_reset_email.html",
                        context,
                    ),
                    "text/html",
                )
                sent_count = message.send(fail_silently=False)
                if sent_count != 1:
                    PasswordResetToken.objects.filter(
                        token_hash=token_hash,
                        used=False,
                    ).update(used=True)
                    logger.error("Password reset email was not accepted by the configured email backend.")
            except (
                OSError,
                smtplib.SMTPException,
                ImproperlyConfigured,
                ValueError,
            ) as exc:
                PasswordResetToken.objects.filter(
                    token_hash=token_hash,
                    used=False,
                ).update(used=True)
                logger.error(
                    "Password reset email delivery failed: exception=%s "
                    "smtp_code=%s detail=%s",
                    type(exc).__name__,
                    getattr(exc, "smtp_code", None),
                    safe_email_error(
                        exc,
                        (user.email, raw_token, reset_url),
                    ),
                )

        return Response(
            {"message": PASSWORD_RESET_MESSAGE},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        if not isinstance(request.data, dict):
            return Response(
                {"detail": INVALID_RESET_LINK_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uid = request.data.get("uid")
        raw_token = request.data.get("token")
        if (
            not isinstance(uid, str)
            or len(uid) > 64
            or not isinstance(raw_token, str)
            or len(raw_token) > 128
        ):
            return Response(
                {"detail": INVALID_RESET_LINK_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            token = PasswordResetToken.verify(raw_token, lock=True)
            if not token:
                return Response(
                    {"detail": INVALID_RESET_LINK_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                decoded_uid = force_str(urlsafe_base64_decode(uid))
            except (TypeError, ValueError, UnicodeDecodeError):
                return Response(
                    {"detail": INVALID_RESET_LINK_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if decoded_uid != str(token.user_id) or not token.user.is_active:
                return Response(
                    {"detail": INVALID_RESET_LINK_MESSAGE},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = PasswordResetConfirmSerializer(
                data=request.data,
                context={"user": token.user},
            )
            if not serializer.is_valid():
                return Response(
                    serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST,
                )

            token.user.set_password(serializer.validated_data["new_password"])
            token.user.save(update_fields=["password", "updated_at"])
            token.mark_used()

        return Response(
            {"message": "Your password has been reset successfully."},
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")

        if not old_password or not new_password:
            return Response(
                {"detail": "Old password and new password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 6:
            return Response(
                {"detail": "New password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        if not user.check_password(old_password):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()

        return Response(
            {"message": "Password changed successfully."},
            status=status.HTTP_200_OK
        )


class UpdateAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user
        email = request.data.get("email")
        phone = request.data.get("phone")
        changed_fields = []

        if email:
            email = email.strip().lower()
            if email != user.email:
                previous_email = user.email
                from accounts.models import User
                if User.objects.filter(email=email).exclude(pk=user.pk).exists():
                    return Response(
                        {"detail": "This email address is already in use."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                user.email = email
                changed_fields.append({
                    "field_name": "email",
                    "old_value": previous_email,
                    "new_value": email,
                })

        if phone is not None:
            phone = phone.strip()
            if phone and Registration.objects.filter(
                phone__iexact=phone
            ).exclude(user=user).exists():
                return Response(
                    {"detail": "This phone number is already in use."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if phone != user.phone:
                changed_fields.append({
                    "field_name": "phone",
                    "old_value": user.phone,
                    "new_value": phone,
                })
            user.phone = phone

        with transaction.atomic():
            user.save()
            registration = user.registrations.order_by("-created_at").first()
            if registration:
                if changed_fields:
                    if registration.status in (
                        Registration.Status.APPROVED,
                        Registration.Status.PUBLISHED,
                    ):
                        pending_data = {}
                        if phone is not None and registration.phone != phone:
                            pending_data["phone"] = phone or None
                        change, _ = ProfileChange.objects.get_or_create(
                            registration=registration,
                            status=ProfileChange.Status.PENDING_REVIEW,
                            defaults={
                                "user": user,
                                "previous_status": registration.status,
                            },
                        )
                        change.user = user
                        change.pending_data = {**change.pending_data, **pending_data}
                        changed_by_field = {
                            item["field_name"]: item
                            for item in change.changed_fields
                        }
                        for item in changed_fields:
                            changed_by_field[item["field_name"]] = item
                        change.changed_fields = list(changed_by_field.values())
                        change.save()
                        verification, _ = ProfileVerification.objects.get_or_create(
                            client=user
                        )
                        verification.status = ProfileVerification.Status.UNDER_REVIEW
                        verification.save(update_fields=["status", "updated_at"])
                    else:
                        if phone is not None:
                            registration.phone = phone or None
                            registration.save()
                    details = list(changed_fields)
                    transaction.on_commit(
                        lambda registration=registration, details=details: (
                            notify_profile_update(registration, details)
                        )
                    )

        return Response(
            {
                "message": "Account details updated successfully.",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "phone": user.phone,
                    "full_name": user.full_name,
                    "role": user.role,
                }
            },
            status=status.HTTP_200_OK
        )


class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != User.Role.CLIENT:
            return Response(
                {"detail": "Only client accounts can be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DeleteAccountSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user = User.objects.select_for_update().filter(
                pk=request.user.pk,
            ).first()
            if user is None:
                return Response(
                    {"detail": "The account is no longer available."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if user.role != User.Role.CLIENT:
                return Response(
                    {"detail": "Only client accounts can be deleted."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not user.check_password(serializer.validated_data["password"]):
                return Response(
                    {"detail": "The password confirmation is incorrect."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            stored_files = _file_references(
                _account_file_querysets(user.pk)
            )
            VerificationChallenge.objects.filter(
                email__iexact=user.email,
            ).delete()
            user.delete()

            if stored_files:
                transaction.on_commit(
                    lambda files=stored_files: _delete_unreferenced_account_files(
                        files
                    )
                )

        return Response(
            {"detail": "Your account has been permanently deleted."},
            status=status.HTTP_200_OK,
        )
