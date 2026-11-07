from datetime import date, timedelta
import logging
import mimetypes
import secrets
from django.http import FileResponse
from PIL import Image, UnidentifiedImageError

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.permissions import (
    AllowAny,
    IsAdminUser,
    IsAuthenticated,
)
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Registration,
    ProfileView,
    Interest,
    Shortlist,
    ClientPhoto,
    Conversation,
    Message,
    VerificationChallenge,
)

from .serializers import (
    RegistrationSerializer,
    PublicProfileSerializer,
    ClientProfileSerializer,
    ProfileViewSerializer,
    InterestSerializer,
    ShortlistSerializer,
    ClientPhotoSerializer,
    ConversationSerializer,
    MessageSerializer,
)
from adminpanel.models import ProfileChange, ProfileVerification
from notifications.emailing import notify_profile_update
from .verification import (
    VerificationDeliveryError,
    send_email_otp,
    send_mobile_otp,
)


logger = logging.getLogger(__name__)


def _changed_profile_fields(registration, values):
    changed = []
    for field, value in values.items():
        old_value = getattr(registration, field, None)
        if hasattr(value, "name"):
            value = value.name
        if hasattr(old_value, "name"):
            old_value = old_value.name
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        if hasattr(old_value, "isoformat"):
            old_value = old_value.isoformat()
        if old_value != value:
            changed.append({"field_name": field, "old_value": old_value, "new_value": value})
    return changed


def _active_profile_change(registration, user):
    change = registration.profile_changes.filter(
        status__in=(
            ProfileChange.Status.PENDING_REVIEW,
            ProfileChange.Status.CORRECTION_REQUIRED,
        )
    ).order_by("-created_at").first()
    if change:
        return change
    return ProfileChange(
        registration=registration,
        user=user,
        previous_status=registration.status,
    )


def _profile_change_deltas(registration, change):
    changed = []
    for field, value in change.pending_data.items():
        old_value = (
            registration.user.email
            if field == "email"
            else getattr(registration, field, None)
        )
        if hasattr(old_value, "isoformat"):
            old_value = old_value.isoformat()
        changed.append({
            "field_name": field,
            "old_value": old_value,
            "new_value": value,
        })

    for field in (
        "profile_photo",
        "identity_document",
        "additional_document",
        "horoscope_file",
    ):
        pending_file = getattr(change, f"pending_{field}")
        if pending_file:
            old_file = getattr(registration, field)
            changed.append({
                "field_name": field,
                "old_value": old_file.name if old_file else None,
                "new_value": pending_file.name,
            })
    if change.pending_horoscope_delete:
        old_file = registration.horoscope_file
        changed.append({
            "field_name": "horoscope_file",
            "old_value": old_file.name if old_file else None,
            "new_value": None,
        })

    pending_photos = registration.photos.filter(
        Q(pending_photo__isnull=False)
        & ~Q(pending_photo="")
        | Q(pending_delete=True)
    )
    for photo in pending_photos:
        changed.append({
            "field_name": "gallery_photo",
            "slot_index": photo.slot_index,
            "old_value": photo.photo.name if photo.photo else None,
            "new_value": photo.pending_photo.name if photo.pending_photo else None,
            "pending_delete": photo.pending_delete,
        })
    return changed


def _submit_profile_change(registration, user, change):
    previous_details = change.changed_fields
    was_pending_review = (
        bool(change.pk)
        and change.status == ProfileChange.Status.PENDING_REVIEW
    )
    changed_fields = _profile_change_deltas(registration, change)
    if not changed_fields:
        change.changed_fields = []
        return False
    should_notify = not was_pending_review or previous_details != changed_fields
    change.changed_fields = changed_fields
    change.status = ProfileChange.Status.PENDING_REVIEW
    change.correction_message = ""
    change.rejection_reason = ""
    change.save()

    verification, _ = ProfileVerification.objects.get_or_create(client=user)
    verification.status = ProfileVerification.Status.UNDER_REVIEW
    verification.correction_message = ""
    verification.rejection_reason = ""
    verification.save(update_fields=[
        "status",
        "correction_message",
        "rejection_reason",
        "updated_at",
    ])
    if should_notify:
        details = list(change.changed_fields)
        transaction.on_commit(
            lambda registration=registration, details=details: (
                notify_profile_update(registration, details)
            )
        )
    return True


def _cancel_empty_profile_change(change, user):
    if not change.pk:
        return
    change.status = ProfileChange.Status.CANCELLED
    change.save(update_fields=["status", "updated_at"])
    verification, _ = ProfileVerification.objects.get_or_create(client=user)
    verification.status = (
        ProfileVerification.Status.APPROVED
        if change.previous_status in (
            Registration.Status.APPROVED,
            Registration.Status.PUBLISHED,
        )
        else change.previous_status
    )
    verification.save(update_fields=["status", "updated_at"])


# =========================================================
# USER REGISTRATION
# =========================================================

class RegistrationCreateView(generics.CreateAPIView):

    queryset = Registration.objects.all()
    serializer_class = RegistrationSerializer
    permission_classes = [AllowAny]


class RegistrationAvailabilityView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        errors = {}
        email = str(request.data.get("email", "")).strip().lower()
        phone = str(request.data.get("phone", "")).strip()
        if email and get_user_model().objects.filter(email__iexact=email).exists():
            errors["email"] = "This email address is already registered. Please log in or use a different email address."
        if phone and Registration.objects.filter(phone__iexact=phone).exists():
            errors["phone"] = "This phone number is already registered. Please use a different number."
        return Response({"available": not errors, "errors": errors})


def _new_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def _otp_expiry():
    return timezone.now() + timedelta(seconds=settings.OTP_EXPIRY_SECONDS)


def _cooldown_response(challenge, now):
    remaining = max(
        0,
        int(max(
            challenge.email_resend_after,
            challenge.phone_resend_after,
        ).timestamp() - now.timestamp()),
    )
    return Response(
        {
            "detail": "Please wait before requesting another verification code.",
            "resend_after": remaining,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _challenge_response_data(challenge, now):
    email_expires_in = max(
        0,
        int((challenge.email_expires_at - now).total_seconds()),
    )
    mobile_expires_in = max(
        0,
        int((challenge.phone_expires_at - now).total_seconds()),
    )
    return {
        "challenge_id": str(challenge.pk),
        "expires_in": max(email_expires_in, mobile_expires_in),
        "channel_expires_in": {
            "email": email_expires_in,
            "mobile": mobile_expires_in,
        },
        "resend_after": {
            "email": max(
                0,
                int((challenge.email_resend_after - now).total_seconds()),
            ),
            "mobile": max(
                0,
                int((challenge.phone_resend_after - now).total_seconds()),
            ),
        },
        "email_verified": challenge.email_verified,
        "mobile_verified": challenge.phone_verified,
    }


class VerificationStartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        phone = str(request.data.get("phone", "")).strip()
        if not email or not phone:
            return Response(
                {"detail": "Email and mobile number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response(
                {"email": "Enter a valid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        errors = {}
        User = get_user_model()
        if User.objects.filter(email__iexact=email).exists():
            errors["email"] = "This email address is already registered."
        if Registration.objects.filter(phone__iexact=phone).exists():
            errors["phone"] = "This phone number is already registered."
        if errors:
            return Response(
                {"detail": "Please use available contact information.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        requested_challenge_id = request.data.get("challenge_id")
        if requested_challenge_id:
            try:
                challenge = VerificationChallenge.objects.get(
                    pk=requested_challenge_id,
                    email=email,
                    phone=phone,
                )
            except (
                VerificationChallenge.DoesNotExist,
                DjangoValidationError,
                ValueError,
                TypeError,
            ):
                return Response(
                    {
                        "detail": (
                            "The saved verification request could not be restored. "
                            "Request new codes."
                        )
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            if challenge.consumed_at or challenge.expires_at <= now:
                return Response(
                    {
                        "detail": (
                            "This verification request has expired. Request new codes."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data = _challenge_response_data(challenge, now)
            data.update({
                "verification_in_progress": True,
                "email_delivery": "restored",
                "mobile_delivery": "restored",
            })
            if challenge.email_verified and challenge.phone_verified:
                data["verification_token"] = str(challenge.pk)
            return Response(data, status=status.HTTP_200_OK)

        active_challenge = VerificationChallenge.objects.filter(
            consumed_at__isnull=True,
            expires_at__gt=now,
        ).filter(Q(email=email) | Q(phone=phone)).order_by("-created_at").first()
        challenge = None
        if active_challenge:
            same_contacts = (
                active_challenge.email == email
                and active_challenge.phone == phone
            )
            if not same_contacts and max(
                active_challenge.email_resend_after,
                active_challenge.phone_resend_after,
            ) > now:
                return _cooldown_response(active_challenge, now)
            if same_contacts:
                data = _challenge_response_data(active_challenge, now)
                data.update({
                    "verification_in_progress": True,
                    "mobile_delivery": "restored",
                    "email_delivery": "restored",
                })
                if active_challenge.email_verified and active_challenge.phone_verified:
                    data["verification_token"] = str(active_challenge.pk)
                return Response(data, status=status.HTTP_200_OK)
            else:
                active_challenge.consumed_at = now
                active_challenge.save(update_fields=["consumed_at"])

        email_otp = _new_otp()
        phone_otp = _new_otp()
        while phone_otp == email_otp:
            phone_otp = _new_otp()
        cooldown = timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS)
        expires_at = _otp_expiry()
        if challenge is None:
            challenge = VerificationChallenge.objects.create(
                email=email,
                phone=phone,
                email_otp_hash=make_password(email_otp),
                phone_otp_hash=make_password(phone_otp),
                email_resend_after=now + cooldown,
                phone_resend_after=now + cooldown,
                email_expires_at=expires_at,
                phone_expires_at=expires_at,
                expires_at=expires_at,
            )
        else:
            challenge.email_otp_hash = make_password(email_otp)
            challenge.phone_otp_hash = make_password(phone_otp)
            challenge.email_attempts = 0
            challenge.phone_attempts = 0
            challenge.email_verified = False
            challenge.phone_verified = False
            challenge.email_resend_after = now + cooldown
            challenge.phone_resend_after = now + cooldown
            challenge.email_expires_at = expires_at
            challenge.phone_expires_at = expires_at
            challenge.expires_at = expires_at
            challenge.save()

        failures = []
        email_delivery = None
        mobile_delivery = None
        for channel, sender, target, otp in (
            ("email", send_email_otp, email, email_otp),
            ("mobile", send_mobile_otp, phone, phone_otp),
        ):
            try:
                delivery_mode = sender(target, otp)
                if channel == "email":
                    email_delivery = delivery_mode
                else:
                    mobile_delivery = delivery_mode
            except VerificationDeliveryError as exc:
                logger.warning("Verification %s delivery failed: %s", channel, exc)
                failures.append({"channel": channel, "detail": str(exc)})

        if failures:
            challenge.consumed_at = timezone.now()
            challenge.save(update_fields=["consumed_at"])
            return Response(
                {
                    "detail": (
                        "Verification could not be completed. Check the delivery "
                        "details and try again."
                    ),
                    "delivery_errors": failures,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response_now = timezone.now()
        data = _challenge_response_data(challenge, response_now)
        data.update({
            "email_sent": email_delivery == "sent",
            "email_delivery": email_delivery,
            "mobile_delivery": mobile_delivery,
        })
        return Response(
            data,
            status=status.HTTP_200_OK,
        )


class VerificationCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        challenge_id = request.data.get("challenge_id")
        channel = request.data.get("channel")
        otp = str(request.data.get("otp", "")).strip()
        phone = str(request.data.get("phone", "")).strip()
        if channel not in ("email", "mobile") or not otp:
            return Response(
                {"detail": "A verification channel and code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if channel == "mobile" and not phone:
            return Response(
                {"phone": "The mobile number is required to verify this code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(otp) != 6 or not otp.isdigit():
            return Response(
                {"detail": "Enter the six-digit verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                challenge = VerificationChallenge.objects.select_for_update().get(
                    pk=challenge_id
                )
                now = timezone.now()
                if channel == "mobile" and challenge.phone != phone:
                    return Response(
                        {"detail": "The mobile number does not match this verification request."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                field_channel = "phone" if channel == "mobile" else channel
                if (
                    challenge.consumed_at
                    or getattr(
                        challenge,
                        f"{field_channel}_expires_at",
                    ) <= now
                ):
                    return Response(
                        {"detail": "This verification request has expired. Request new codes."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                verified_field = f"{field_channel}_verified"
                attempts_field = f"{field_channel}_attempts"
                hash_field = f"{field_channel}_otp_hash"
                if getattr(challenge, verified_field):
                    return Response(
                        {"detail": "This verification code has already been used."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                attempts = getattr(challenge, attempts_field)
                if attempts >= settings.OTP_MAX_ATTEMPTS:
                    return Response(
                        {"detail": "Too many incorrect attempts. Request new codes."},
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )
                if not check_password(otp, getattr(challenge, hash_field)):
                    attempts += 1
                    setattr(challenge, attempts_field, attempts)
                    challenge.save(update_fields=[attempts_field])
                    remaining = max(0, settings.OTP_MAX_ATTEMPTS - attempts)
                    return Response(
                        {
                            "detail": "The verification code is incorrect.",
                            "attempts_remaining": remaining,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                setattr(challenge, verified_field, True)
                challenge.save(update_fields=[verified_field])
                data = {
                    "email_verified": challenge.email_verified,
                    "mobile_verified": challenge.phone_verified,
                }
                if challenge.email_verified and challenge.phone_verified:
                    data["verification_token"] = str(challenge.pk)
                return Response(data, status=status.HTTP_200_OK)
        except (
            VerificationChallenge.DoesNotExist,
            DjangoValidationError,
            ValueError,
            TypeError,
        ):
            return Response(
                {"detail": "Verification request not found. Request new codes."},
                status=status.HTTP_404_NOT_FOUND,
            )


class VerificationResendView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        challenge_id = request.data.get("challenge_id")
        channel = request.data.get("channel")
        if channel not in ("email", "mobile"):
            return Response(
                {"detail": "Choose email or mobile verification."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            with transaction.atomic():
                challenge = VerificationChallenge.objects.select_for_update().get(
                    pk=challenge_id
                )
                now = timezone.now()
                if challenge.consumed_at or challenge.expires_at <= now:
                    return Response(
                        {"detail": "This verification request has expired. Start verification again."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                field_channel = "phone" if channel == "mobile" else channel
                attempts_field = f"{field_channel}_attempts"
                if getattr(challenge, attempts_field) >= settings.OTP_MAX_ATTEMPTS:
                    return Response(
                        {"detail": "Too many incorrect attempts. Start verification again."},
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )
                resend_field = f"{field_channel}_resend_after"
                resend_after = getattr(challenge, resend_field)
                if resend_after > now:
                    return Response(
                        {
                            "detail": "Please wait before requesting another verification code.",
                            "resend_after": max(0, int((resend_after - now).total_seconds())),
                        },
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )

                otp = _new_otp()
                sender = send_email_otp if channel == "email" else send_mobile_otp
                target = challenge.email if channel == "email" else challenge.phone
                setattr(
                    challenge,
                    resend_field,
                    now + timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS),
                )
                challenge.save(update_fields=[resend_field])
                try:
                    delivery_mode = sender(target, otp)
                except VerificationDeliveryError as exc:
                    return Response(
                        {
                            "detail": str(exc),
                            "resend_after": settings.OTP_RESEND_COOLDOWN_SECONDS,
                        },
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )

                setattr(challenge, f"{field_channel}_otp_hash", make_password(otp))
                setattr(challenge, attempts_field, 0)
                setattr(challenge, f"{field_channel}_verified", False)
                channel_expires_at = _otp_expiry()
                setattr(
                    challenge,
                    f"{field_channel}_expires_at",
                    channel_expires_at,
                )
                challenge.expires_at = max(
                    challenge.email_expires_at,
                    challenge.phone_expires_at,
                )
                challenge.save(
                    update_fields=[
                        f"{field_channel}_otp_hash",
                        attempts_field,
                        f"{field_channel}_verified",
                        f"{field_channel}_expires_at",
                        resend_field,
                        "expires_at",
                    ]
                )
                return Response(
                    {
                        "message": (
                            (
                                "A new email verification code is available in the "
                                "Django development console."
                                if delivery_mode == "console"
                                else "A new email verification code was sent."
                            )
                            if channel == "email"
                            else (
                                "A new mobile verification code was generated. "
                                "Check the Django development console."
                                if delivery_mode == "development_console"
                                else "A new mobile verification code was sent."
                            )
                        ),
                        "delivery": delivery_mode,
                        "expires_in": settings.OTP_EXPIRY_SECONDS,
                        "channel_expires_in": settings.OTP_EXPIRY_SECONDS,
                        "resend_after": settings.OTP_RESEND_COOLDOWN_SECONDS,
                    },
                    status=status.HTTP_200_OK,
                )
        except (
            VerificationChallenge.DoesNotExist,
            DjangoValidationError,
            ValueError,
            TypeError,
        ):
            return Response(
                {"detail": "Verification request not found. Start verification again."},
                status=status.HTTP_404_NOT_FOUND,
            )


# =========================================================
# PUBLIC - PUBLISHED PROFILES
# LIST + SEARCH FILTERS
# =========================================================

class PublishedRegistrationListView(generics.ListAPIView):

    serializer_class = PublicProfileSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):

        queryset = Registration.objects.filter(
            status=Registration.Status.PUBLISHED
        ).order_by("-published_at")

        params = self.request.query_params

        # -------------------------------------------------
        # GENDER
        # -------------------------------------------------

        gender = params.get("gender")

        if gender and gender.lower() != "all":
            queryset = queryset.filter(
                gender__iexact=gender
            )

        # -------------------------------------------------
        # RELIGION
        # -------------------------------------------------

        religion = params.get("religion")

        if religion:
            queryset = queryset.filter(
                religion__icontains=religion
            )

        birth_star = params.get("birth_star")

        if birth_star:
            queryset = queryset.filter(
                birth_star__iexact=birth_star
            )

        # -------------------------------------------------
        # CASTE
        # -------------------------------------------------

        caste = params.get("caste")

        if caste:
            queryset = queryset.filter(
                caste__icontains=caste
            )

        # -------------------------------------------------
        # MARITAL STATUS
        # -------------------------------------------------

        marital_status = params.get("marital_status")

        if marital_status:
            queryset = queryset.filter(
                marital_status__icontains=marital_status
            )

        # -------------------------------------------------
        # DISTRICT
        # -------------------------------------------------

        district = params.get("district")

        if district:
            queryset = queryset.filter(
                district__icontains=district
            )

        # -------------------------------------------------
        # EDUCATION
        # -------------------------------------------------

        education = params.get("education")

        if education:
            queryset = queryset.filter(
                Q(education__icontains=education)
                | Q(education_level__icontains=education)
            )

        # -------------------------------------------------
        # OCCUPATION
        # -------------------------------------------------

        occupation = params.get("occupation")

        if occupation:
            queryset = queryset.filter(
                Q(occupation__icontains=occupation)
                | Q(occupation_level__icontains=occupation)
            )

        # -------------------------------------------------
        # AGE RANGE
        # -------------------------------------------------

        age_from = params.get("age_from")
        age_to = params.get("age_to")

        today = date.today()

        if age_from and age_from.isdigit():

            max_dob = date(
                today.year - int(age_from),
                today.month,
                today.day
            )

            queryset = queryset.filter(
                date_of_birth__lte=max_dob
            )

        if age_to and age_to.isdigit():

            min_dob = date(
                today.year - int(age_to) - 1,
                today.month,
                today.day
            )

            queryset = queryset.filter(
                date_of_birth__gt=min_dob
            )

        height_from = params.get("height_from_cm")
        height_to = params.get("height_to_cm")
        if (
            (height_from and height_from.isdigit())
            or (height_to and height_to.isdigit())
        ):
            min_height = int(height_from) if height_from and height_from.isdigit() else 0
            max_height = int(height_to) if height_to and height_to.isdigit() else 1000
            if min_height > max_height:
                return queryset.none()

            matching_heights = [
                f"{total_inches // 12}'{total_inches % 12}\""
                for total_inches in range(48, 85)
                if min_height <= round(total_inches * 2.54) <= max_height
            ]
            queryset = queryset.filter(height__in=matching_heights)

        return queryset


# =========================================================
# PUBLIC - SINGLE PROFILE
# =========================================================

class PublishedRegistrationDetailView(
    generics.RetrieveAPIView
):

    queryset = Registration.objects.filter(
        status=Registration.Status.PUBLISHED
    )

    serializer_class = PublicProfileSerializer
    permission_classes = [AllowAny]


# =========================================================
# ADMIN - PENDING REGISTRATIONS
# =========================================================

class PendingRegistrationListView(generics.ListAPIView):

    queryset = Registration.objects.filter(
        status=Registration.Status.PENDING
    )

    serializer_class = RegistrationSerializer
    permission_classes = [IsAdminUser]


# =========================================================
# ADMIN - VIEW REGISTRATION
# =========================================================

class RegistrationDetailView(generics.RetrieveAPIView):

    queryset = Registration.objects.all()
    serializer_class = RegistrationSerializer
    permission_classes = [IsAdminUser]


# =========================================================
# ADMIN - APPROVE REGISTRATION
# =========================================================

class RegistrationApproveView(APIView):

    permission_classes = [IsAdminUser]

    def post(self, request, pk):

        try:

            registration = Registration.objects.get(
                pk=pk
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Registration not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # -------------------------------------------------
        # VALID STATUS
        # -------------------------------------------------

        if registration.status not in [
            Registration.Status.PENDING,
            Registration.Status.UNDER_REVIEW,
        ]:

            return Response(
                {
                    "detail": (
                        "Only pending or under review "
                        "registrations can be approved."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # -------------------------------------------------
        # GENERATE MATRIMONY ID
        # -------------------------------------------------

        if not registration.matrimony_id:

            last_registration = (
                Registration.objects
                .exclude(matrimony_id="")
                .order_by("-id")
                .first()
            )

            if (
                last_registration
                and last_registration.matrimony_id
            ):

                try:

                    last_number = int(
                        last_registration
                        .matrimony_id
                        .replace("WN", "")
                    )

                    next_number = last_number + 1

                except ValueError:

                    next_number = 100001

            else:

                next_number = 100001

            registration.matrimony_id = (
                f"WN{next_number}"
            )

        # -------------------------------------------------
        # APPROVE
        # -------------------------------------------------

        registration.status = (
            Registration.Status.APPROVED
        )

        registration.verified_by = request.user

        registration.verified_at = timezone.now()

        registration.save()

        return Response(
            {
                "message": (
                    "Registration approved successfully."
                ),
                "matrimony_id": registration.matrimony_id,
                "status": registration.status,
                "email": registration.user.email,
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# ADMIN - REJECT REGISTRATION
# =========================================================

class RegistrationRejectView(APIView):

    permission_classes = [IsAdminUser]

    def post(self, request, pk):

        try:

            registration = Registration.objects.get(
                pk=pk
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Registration not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        reason = request.data.get(
            "reason",
            ""
        ).strip()

        if not reason:

            return Response(
                {
                    "detail": (
                        "Rejection reason is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        registration.status = (
            Registration.Status.REJECTED
        )

        registration.rejection_reason = reason

        registration.verified_by = request.user

        registration.verified_at = timezone.now()

        registration.save()

        return Response(
            {
                "message": "Registration rejected.",
                "status": registration.status,
                "reason": registration.rejection_reason,
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# ADMIN - CORRECTION REQUIRED
# =========================================================

class RegistrationCorrectionView(APIView):

    permission_classes = [IsAdminUser]

    def post(self, request, pk):

        try:

            registration = Registration.objects.get(
                pk=pk
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Registration not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        reason = request.data.get(
            "reason",
            ""
        ).strip()

        if not reason:

            return Response(
                {
                    "detail": (
                        "Correction reason is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        registration.status = (
            Registration.Status.CORRECTION_REQUIRED
        )

        registration.correction_reason = reason

        registration.save()

        return Response(
            {
                "message": "Correction requested.",
                "status": registration.status,
                "reason": registration.correction_reason,
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# ADMIN - PUBLISH REGISTRATION
# =========================================================

class RegistrationPublishView(APIView):

    permission_classes = [IsAdminUser]

    def post(self, request, pk):

        try:

            registration = Registration.objects.get(
                pk=pk
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Registration not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if registration.status != Registration.Status.APPROVED:

            return Response(
                {
                    "detail": (
                        "Only approved registrations "
                        "can be published."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        registration.status = (
            Registration.Status.PUBLISHED
        )

        registration.published_at = timezone.now()

        registration.save()

        return Response(
            {
                "message": (
                    "Registration published successfully."
                ),
                "matrimony_id": registration.matrimony_id,
                "status": registration.status,
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# CLIENT - MY PROFILE
# GET / PUT / PATCH
# =========================================================

class MyProfileView(
    generics.RetrieveUpdateAPIView
):

    serializer_class = ClientProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):

        try:

            return Registration.objects.get(
                user=self.request.user
            )

        except Registration.DoesNotExist:

            raise NotFound(
                detail=(
                    "Profile registration "
                    "not found for this account."
                )
            )

    def perform_update(self, serializer):
        registration = serializer.instance
        values = dict(serializer.validated_data)
        email = values.pop("email", None)
        files = {
            key: values.pop(key)
            for key in (
                "profile_photo",
                "identity_document",
                "additional_document",
            )
            if key in values
        }
        values = {
            key: value
            for key, value in values.items()
            if key in {field.name for field in Registration._meta.concrete_fields}
            and key not in {"user", "id"}
        }
        if email is not None:
            values["email"] = email

        uploaded_files = []
        replaced_pending_files = []
        try:
            with transaction.atomic():
                registration = Registration.objects.select_for_update().get(
                    pk=registration.pk
                )
                change = (
                    ProfileChange.objects.select_for_update()
                    .filter(
                        registration=registration,
                        status__in=(
                            ProfileChange.Status.PENDING_REVIEW,
                            ProfileChange.Status.CORRECTION_REQUIRED,
                        ),
                    )
                    .order_by("-created_at")
                    .first()
                )
                previous_status = (
                    change.previous_status if change else registration.status
                )
                pending_data = dict(change.pending_data) if change else {}

                for field, value in values.items():
                    base_value = (
                        registration.user.email
                        if field == "email"
                        else getattr(registration, field)
                    )
                    serialized_value = (
                        value.isoformat() if hasattr(value, "isoformat") else value
                    )
                    serialized_base = (
                        base_value.isoformat()
                        if hasattr(base_value, "isoformat")
                        else base_value
                    )
                    if serialized_value == serialized_base:
                        pending_data.pop(field, None)
                    else:
                        pending_data[field] = serialized_value

                if change is None and (pending_data or files):
                    change = ProfileChange(
                        registration=registration,
                        user=self.request.user,
                        previous_status=registration.status,
                    )
                elif change:
                    change.user = self.request.user

                if change:
                    for field, value in files.items():
                        pending_field = f"pending_{field}"
                        previous_file = getattr(change, pending_field)
                        if previous_file:
                            replaced_pending_files.append(
                                (previous_file.storage, previous_file.name)
                            )
                        file_field = getattr(change, pending_field)
                        file_field.save(value.name, value, save=False)
                        uploaded_files.append((file_field.storage, file_field.name))
                        if not file_field.storage.exists(file_field.name):
                            raise OSError(
                                f"Uploaded {field.replace('_', ' ')} was not found in media storage after saving."
                            )

                    change.pending_data = pending_data
                    change_fields = _profile_change_deltas(registration, change)
                    if change_fields:
                        _submit_profile_change(
                            registration,
                            self.request.user,
                            change,
                        )
                    else:
                        _cancel_empty_profile_change(
                            change,
                            self.request.user,
                        )

                    for storage, file_name in replaced_pending_files:
                        transaction.on_commit(
                            lambda storage=storage, name=file_name: storage.delete(name)
                        )
        except Exception:
            for storage, name in uploaded_files:
                try:
                    storage.delete(name)
                except Exception:
                    logger.exception(
                        "Failed to remove unreferenced profile upload %s after update failure.",
                        name,
                    )
            raise

class MyHoroscopeFileView(APIView):

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    max_file_size = 5 * 1024 * 1024

    def get_registration(self, request):
        try:
            return Registration.objects.get(user=request.user)
        except Registration.DoesNotExist:
            return None

    def get(self, request):
        registration = self.get_registration(request)
        if registration is None:
            return Response(
                {"detail": "Registration profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not registration.horoscope_file:
            return Response(
                {"detail": "No horoscope file has been uploaded."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            horoscope_file = registration.horoscope_file.open("rb")
        except OSError:
            logger.exception(
                "Unable to open horoscope file for registration %s.",
                registration.pk,
            )
            return Response(
                {"detail": "The stored horoscope file could not be opened."},
                status=status.HTTP_404_NOT_FOUND,
            )

        response = FileResponse(horoscope_file, content_type="image/jpeg")
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response

    def post(self, request):
        registration = self.get_registration(request)
        if registration is None:
            return Response(
                {"detail": "Registration profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        horoscope_file = request.FILES.get("horoscope_file")
        if not horoscope_file:
            return Response(
                {"detail": "A JPG horoscope file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if horoscope_file.size > self.max_file_size:
            return Response(
                {"detail": "The JPG horoscope file must be smaller than 5 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not horoscope_file.name.lower().endswith((".jpg", ".jpeg")):
            return Response(
                {"detail": "Choose a JPG or JPEG file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            image = Image.open(horoscope_file)
            image.verify()
            is_jpeg = image.format == "JPEG"
            horoscope_file.seek(0)
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
            is_jpeg = False

        if not is_jpeg:
            return Response(
                {"detail": "The uploaded file is not a valid JPG image."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        change = _active_profile_change(registration, request.user)
        previous_pending_file = change.pending_horoscope_file
        previous_pending_path = (
            (previous_pending_file.storage, previous_pending_file.name)
            if previous_pending_file
            else None
        )
        pending_file = change.pending_horoscope_file
        pending_file.save(horoscope_file.name, horoscope_file, save=False)
        change.pending_horoscope_file = pending_file
        change.pending_horoscope_delete = False
        _submit_profile_change(registration, request.user, change)
        if previous_pending_path:
            storage, file_name = previous_pending_path
            transaction.on_commit(
                lambda storage=storage, name=file_name: storage.delete(name)
            )
        details = list(change.changed_fields)

        return Response(
            {
                "message": "Horoscope file uploaded and sent for admin review.",
                "horoscope_file_url": request.build_absolute_uri(
                    f"/api/registrations/pending-files/horoscope-file/{change.pk}/"
                ),
                "status": "UNDER_REVIEW",
                "changed_fields": change.changed_fields,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request):
        registration = self.get_registration(request)
        if registration is None:
            return Response(
                {"detail": "Registration profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        change = _active_profile_change(registration, request.user)
        if not registration.horoscope_file and not change.pending_horoscope_file:
            return Response(
                {"detail": "No horoscope file has been uploaded."},
                status=status.HTTP_404_NOT_FOUND,
            )

        previous_pending_file = change.pending_horoscope_file
        previous_pending_path = (
            (previous_pending_file.storage, previous_pending_file.name)
            if previous_pending_file
            else None
        )
        change.pending_horoscope_file = None
        change.pending_horoscope_delete = bool(registration.horoscope_file)
        if not _submit_profile_change(registration, request.user, change):
            _cancel_empty_profile_change(change, request.user)
        if previous_pending_path:
            storage, file_name = previous_pending_path
            transaction.on_commit(
                lambda storage=storage, name=file_name: storage.delete(name)
            )

        details = list(change.changed_fields)
        return Response({
            "message": "Horoscope file removal sent for admin review.",
            "status": "UNDER_REVIEW" if change.changed_fields else registration.status,
            "changed_fields": change.changed_fields,
        })


# =========================================================
# CLIENT - PROFILE VIEW RECORDING
# =========================================================

class ProfileViewCreateView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):

        try:

            profile = Registration.objects.get(
                pk=pk,
                status=Registration.Status.PUBLISHED
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Published profile not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if profile.user == request.user:

            return Response(
                {
                    "detail": (
                        "You cannot view your own profile."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        ProfileView.objects.create(
            viewer=request.user,
            viewed_profile=profile
        )

        return Response(
            {
                "message": "Profile view recorded."
            },
            status=status.HTTP_201_CREATED
        )


# =========================================================
# CLIENT - SEND INTEREST
# =========================================================

class SendInterestView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):

        try:

            profile = Registration.objects.get(
                pk=pk,
                status=Registration.Status.PUBLISHED
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Published profile not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if profile.user == request.user:

            return Response(
                {
                    "detail": (
                        "You cannot send interest "
                        "to yourself."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        interest, created = Interest.objects.get_or_create(
            sender=request.user,
            receiver=profile.user,
            defaults={
                "status": Interest.Status.PENDING
            }
        )

        if not created:

            return Response(
                {
                    "detail": (
                        "Interest already sent "
                        "to this profile."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "message": (
                    "Interest sent successfully."
                ),
                "status": interest.status,
            },
            status=status.HTTP_201_CREATED
        )


# =========================================================
# CLIENT - ACCEPT / DECLINE INTEREST
# =========================================================

class UpdateInterestView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):

        action = request.data.get(
            "action"
        )

        if action not in [
            "accept",
            "decline"
        ]:

            return Response(
                {
                    "detail": (
                        "Action must be "
                        "'accept' or 'decline'."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:

            interest = Interest.objects.get(
                id=pk,
                receiver=request.user
            )

        except Interest.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Interest record not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if action == "accept":

            interest.status = (
                Interest.Status.ACCEPTED
            )

        else:

            interest.status = (
                Interest.Status.DECLINED
            )

        interest.save()

        return Response(
            {
                "message": (
                    f"Interest {action}ed successfully."
                ),
                "status": interest.status,
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# CLIENT - RECEIVED INTERESTS
# =========================================================

class ReceivedInterestsListView(
    generics.ListAPIView
):

    serializer_class = InterestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):

        return Interest.objects.filter(
            receiver=self.request.user
        ).order_by("-created_at")


# =========================================================
# CLIENT - SENT INTERESTS
# =========================================================

class SentInterestsListView(
    generics.ListAPIView
):

    serializer_class = InterestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):

        return Interest.objects.filter(
            sender=self.request.user
        ).order_by("-created_at")


# =========================================================
# CLIENT - ADD SHORTLIST
# =========================================================

class ShortlistProfileView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):

        try:

            profile = Registration.objects.get(
                pk=pk,
                status=Registration.Status.PUBLISHED
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": "Published profile not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if profile.user == request.user:

            return Response(
                {
                    "detail": (
                        "You cannot shortlist "
                        "your own profile."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        shortlist, created = (
            Shortlist.objects.get_or_create(
                user=request.user,
                profile=profile
            )
        )

        if not created:

            return Response(
                {
                    "detail": (
                        "Profile already shortlisted."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "message": (
                    "Profile shortlisted successfully."
                )
            },
            status=status.HTTP_201_CREATED
        )


# =========================================================
# CLIENT - REMOVE SHORTLIST
# =========================================================

class RemoveShortlistView(APIView):

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):

        deleted, _ = Shortlist.objects.filter(
            user=request.user,
            profile_id=pk
        ).delete()

        if not deleted:

            return Response(
                {
                    "detail": (
                        "Profile is not in "
                        "your shortlist."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        return Response(
            {
                "message": (
                    "Profile removed from shortlist."
                )
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# CLIENT - SHORTLIST LIST
# =========================================================

class ShortlistListView(
    generics.ListAPIView
):

    serializer_class = ShortlistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):

        return (
            Shortlist.objects
            .filter(user=self.request.user)
            .select_related("profile")
            .order_by("-created_at")
        )


# =========================================================
# CLIENT - LIST PHOTOS
# =========================================================

class ClientPhotoListView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):

        try:

            registration = Registration.objects.get(
                user=request.user
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Registration profile not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # -------------------------------------------------
        # GET EXISTING PHOTOS
        # -------------------------------------------------

        photos_by_slot = {}

        photos = ClientPhoto.objects.filter(
            registration=registration
        )

        for photo_obj in photos:

            photos_by_slot[
                photo_obj.slot_index
            ] = photo_obj

        # -------------------------------------------------
        # ALWAYS RETURN 4 SLOTS
        # -------------------------------------------------

        result = []

        for i in range(1, 5):

            photo_obj = photos_by_slot.get(i)

            if photo_obj:

                serializer = ClientPhotoSerializer(
                    photo_obj,
                    context={
                        "request": request
                    }
                )

                result.append(
                    serializer.data
                )

            else:

                photo_url = None

                # Slot 1 can use Registration.profile_photo
                if (
                    i == 1
                    and registration.profile_photo
                ):

                    photo_url = (
                        request.build_absolute_uri(
                            registration
                            .profile_photo
                            .url
                        )
                    )

                result.append(
                    {
                        "id": None,
                        "slot_index": i,
                        "is_main": i == 1,
                        "status": (
                            "APPROVED"
                            if photo_url
                            else "EMPTY"
                        ),
                        "photo_url": photo_url,
                        "pending_photo_url": None,
                        "created_at": None,
                        "updated_at": None,
                    }
                )

        return Response(result)


# =========================================================
# CLIENT - UPLOAD PHOTO
# =========================================================

class ClientPhotoUploadView(APIView):

    permission_classes = [IsAuthenticated]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    def post(self, request):

        try:

            registration = Registration.objects.get(
                user=request.user
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Registration profile not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        slot_index = request.data.get(
            "slot_index"
        )

        photo_file = request.FILES.get(
            "photo"
        )

        # -------------------------------------------------
        # VALIDATE
        # -------------------------------------------------

        if not slot_index or not photo_file:

            return Response(
                {
                    "detail": (
                        "slot_index and photo file "
                        "are required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if photo_file.size > 5 * 1024 * 1024 or not photo_file.name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            return Response({"detail": "Choose a JPG, PNG, or WebP image smaller than 5 MB."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            image = Image.open(photo_file)
            image.verify()
            photo_file.seek(0)
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
            return Response({"detail": "The uploaded file is not a valid image."}, status=status.HTTP_400_BAD_REQUEST)

        try:

            slot_index = int(slot_index)

            if slot_index < 1 or slot_index > 4:

                raise ValueError

        except ValueError:

            return Response(
                {
                    "detail": (
                        "slot_index must be an integer "
                        "between 1 and 4."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # -------------------------------------------------
        # GET / CREATE SLOT
        # -------------------------------------------------

        client_photo, created = (
            ClientPhoto.objects.get_or_create(
                registration=registration,
                slot_index=slot_index,
                defaults={
                    "is_main": slot_index == 1
                }
            )
        )

        if (
            slot_index == 1
            and registration.profile_photo
            and not client_photo.photo
        ):
            client_photo.photo = registration.profile_photo
            client_photo.is_main = True

        old_pending_photo = client_photo.pending_photo
        client_photo.pending_photo = photo_file
        client_photo.pending_delete = False
        client_photo.status = ClientPhoto.Status.PENDING
        client_photo.save()
        if old_pending_photo:
            transaction.on_commit(
                lambda file=old_pending_photo: file.delete(save=False)
            )

        change = _active_profile_change(registration, request.user)
        change.changed_fields = _profile_change_deltas(registration, change)
        change.status = ProfileChange.Status.PENDING_REVIEW
        change.correction_message = ""
        change.rejection_reason = ""
        change.save()

        verification, _ = ProfileVerification.objects.get_or_create(
            client=request.user
        )
        verification.status = ProfileVerification.Status.UNDER_REVIEW
        verification.correction_message = ""
        verification.rejection_reason = ""
        verification.save(update_fields=[
            "status",
            "correction_message",
            "rejection_reason",
            "updated_at",
        ])
        details = list(change.changed_fields)
        transaction.on_commit(
            lambda registration=registration, details=details: (
                notify_profile_update(registration, details)
            )
        )

        message = (
            "Photo uploaded and sent for admin review. "
            "Existing photos remain visible until approval."
        )

        serializer = ClientPhotoSerializer(
            client_photo,
            context={
                "request": request
            }
        )

        return Response(
            {
                "message": message,
                "photo": serializer.data,
            },
            status=status.HTTP_200_OK
        )


# =========================================================
# CLIENT - PHOTO ACTION
#
# POST:
# /photos/<slot_index>/set-main/
#
# DELETE:
# /photos/<slot_index>/delete/
# =========================================================

class ClientPhotoActionView(APIView):

    permission_classes = [IsAuthenticated]

    # =====================================================
    # POST ACTIONS
    # =====================================================

    def post(
        self,
        request,
        slot_index,
        action
    ):

        try:

            registration = Registration.objects.get(
                user=request.user
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Registration profile not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # -------------------------------------------------
        # SET MAIN PHOTO
        # -------------------------------------------------

        if action == "set-main":

            client_photo = (
                ClientPhoto.objects.filter(
                    registration=registration,
                    slot_index=slot_index
                ).first()
            )

            if not client_photo:

                return Response(
                    {
                        "detail": "Photo not found."
                    },
                    status=status.HTTP_404_NOT_FOUND
                )

            # Cannot make pending photo main
            if (
                not client_photo.photo
                or client_photo.status
                != ClientPhoto.Status.APPROVED
            ):

                return Response(
                    {
                        "detail": (
                            "This photo is not "
                            "approved yet."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            if (
                registration.profile_photo
                and registration.profile_photo.name == client_photo.photo.name
            ):
                return Response(
                    {"message": "This is already your main photo."},
                    status=status.HTTP_200_OK,
                )

            change = _active_profile_change(registration, request.user)
            previous_pending = change.pending_profile_photo
            previous_pending_path = (
                (previous_pending.storage, previous_pending.name)
                if previous_pending
                else None
            )
            client_photo.photo.open("rb")
            try:
                change.pending_profile_photo.save(
                    client_photo.photo.name.rsplit("/", 1)[-1],
                    client_photo.photo.file,
                    save=False,
                )
            finally:
                client_photo.photo.close()
            _submit_profile_change(registration, request.user, change)
            if previous_pending_path:
                storage, file_name = previous_pending_path
                transaction.on_commit(
                    lambda storage=storage, name=file_name: storage.delete(name)
                )

            return Response(
                {
                    "message": "Main photo change sent for admin review.",
                    "status": "UNDER_REVIEW",
                },
                status=status.HTTP_200_OK
            )

        return Response(
            {
                "detail": "Invalid photo action."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    def delete(self, request, slot_index, action):
        if action != "delete":
            return Response(
                {"detail": "Invalid photo action."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            registration = Registration.objects.get(user=request.user)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        client_photo = ClientPhoto.objects.filter(
            registration=registration,
            slot_index=slot_index,
        ).first()
        if (
            client_photo is None
            and slot_index == 1
            and registration.profile_photo
        ):
            client_photo = ClientPhoto.objects.create(
                registration=registration,
                slot_index=1,
                is_main=True,
                photo=registration.profile_photo,
                status=ClientPhoto.Status.APPROVED,
            )
        if not client_photo:
            return Response(
                {"detail": "Photo not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        change = _active_profile_change(registration, request.user)
        if client_photo.photo:
            discarded_pending = client_photo.pending_photo
            discarded_pending_path = (
                (discarded_pending.storage, discarded_pending.name)
                if discarded_pending
                else None
            )
            client_photo.pending_photo = None
            client_photo.pending_delete = True
            client_photo.status = ClientPhoto.Status.PENDING
            client_photo.save(update_fields=[
                "pending_photo",
                "pending_delete",
                "status",
                "updated_at",
            ])
            if discarded_pending_path:
                storage, file_name = discarded_pending_path
                transaction.on_commit(
                    lambda storage=storage, name=file_name: storage.delete(name)
                )
            message = "Photo removal sent for admin review."
        else:
            pending_file = client_photo.pending_photo
            pending_file_path = (
                (pending_file.storage, pending_file.name)
                if pending_file
                else None
            )
            client_photo.delete()
            if pending_file_path:
                storage, file_name = pending_file_path
                transaction.on_commit(
                    lambda storage=storage, name=file_name: storage.delete(name)
                )
            message = "Unapproved photo upload withdrawn."

        if not _submit_profile_change(registration, request.user, change):
            _cancel_empty_profile_change(change, request.user)

        return Response(
            {
                "message": message,
                "slot_index": slot_index,
                "status": "UNDER_REVIEW" if change.changed_fields else registration.status,
            },
            status=status.HTTP_200_OK,
        )


class PendingFileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, kind, pk):
        try:
            return self._get_pending_file(request, kind, pk)
        except FileNotFoundError:
            logger.exception(
                "Pending file is missing from storage (kind=%s, object_id=%s)",
                kind,
                pk,
            )
            return Response(
                {"detail": "Pending file not found.", "code": "pending_file_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception(
                "Pending file retrieval failed (kind=%s, object_id=%s, user_id=%s)",
                kind,
                pk,
                request.user.pk,
            )
            return Response(
                {"detail": "Pending file could not be retrieved.", "code": "pending_file_error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _get_pending_file(self, request, kind, pk):
        if kind == "gallery-photo":
            photo = ClientPhoto.objects.select_related("registration__user").filter(pk=pk).first()
            owner = photo.registration.user if photo else None
            file_field = photo.pending_photo if photo else None
            filename = file_field.name if file_field else ""
        elif kind in ("client-identity-document", "client-additional-document"):
            registration = Registration.objects.select_related("user").filter(pk=pk).first()
            owner = registration.user if registration else None
            field_name = "identity_document" if "identity" in kind else "additional_document"
            file_field = getattr(registration, field_name) if registration else None
            filename = file_field.name if file_field else ""
        else:
            change = ProfileChange.objects.select_related("registration__user").filter(pk=pk).first()
            owner = change.registration.user if change else None
            field_name = {
                "profile-photo": "pending_profile_photo",
                "identity-document": "pending_identity_document",
                "additional-document": "pending_additional_document",
                "horoscope-file": "pending_horoscope_file",
            }.get(kind)
            file_field = getattr(change, field_name) if change and field_name else None
            filename = file_field.name if file_field else ""

        if owner and request.user != owner and getattr(request.user, "role", None) != "ADMIN":
            return Response({"detail": "You do not have access to this file."}, status=status.HTTP_403_FORBIDDEN)
        if not file_field or not filename:
            return Response(
                {"detail": "Pending file not found.", "code": "pending_file_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        return FileResponse(file_field.open("rb"), content_type=content_type)

# =========================================================
# CLIENT - CONVERSATIONS LIST
# =========================================================

class ConversationListView(
    generics.ListAPIView
):

    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):

        user = self.request.user

        return (
            Conversation.objects.filter(
                Q(participant1=user)
                | Q(participant2=user)
            )
            .order_by("-updated_at")
        )


# =========================================================
# CLIENT - CONVERSATION DETAIL
# =========================================================

class ConversationDetailView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):

        try:

            conversation = Conversation.objects.get(
                Q(participant1=request.user)
                | Q(participant2=request.user),
                pk=pk
            )

        except Conversation.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Conversation not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # -------------------------------------------------
        # MARK RECEIVED MESSAGES AS READ
        # -------------------------------------------------

        Message.objects.filter(
            conversation=conversation,
            is_read=False
        ).exclude(
            sender=request.user
        ).update(
            is_read=True
        )

        # -------------------------------------------------
        # MESSAGES
        # -------------------------------------------------

        messages = conversation.messages.all()

        message_serializer = MessageSerializer(
            messages,
            many=True,
            context={
                "request": request
            }
        )

        # -------------------------------------------------
        # CONVERSATION
        # -------------------------------------------------

        conversation_serializer = (
            ConversationSerializer(
                conversation,
                context={
                    "request": request
                }
            )
        )

        return Response(
            {
                "conversation": (
                    conversation_serializer.data
                ),
                "messages": (
                    message_serializer.data
                ),
            }
        )


# =========================================================
# CLIENT - SEND MESSAGE
# =========================================================

class SendMessageView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):

        content = request.data.get(
            "content",
            ""
        ).strip()

        if not content:

            return Response(
                {
                    "detail": (
                        "Message content is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:

            conversation = Conversation.objects.get(
                Q(participant1=request.user)
                | Q(participant2=request.user),
                pk=pk
            )

        except Conversation.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Conversation not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # -------------------------------------------------
        # CREATE MESSAGE
        # -------------------------------------------------

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content
        )

        # -------------------------------------------------
        # UPDATE CONVERSATION TIME
        # -------------------------------------------------

        conversation.updated_at = timezone.now()

        conversation.save(
            update_fields=[
                "updated_at"
            ]
        )

        serializer = MessageSerializer(
            message,
            context={
                "request": request
            }
        )

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED
        )


# =========================================================
# CLIENT - START CONVERSATION
# =========================================================

class StartConversationView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):

        target_profile_id = request.data.get(
            "profile_id"
        )

        content = request.data.get(
            "content",
            ""
        ).strip()

        if not target_profile_id:

            return Response(
                {
                    "detail": (
                        "profile_id is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # -------------------------------------------------
        # FIND TARGET PROFILE
        # -------------------------------------------------

        try:

            target_registration = (
                Registration.objects.get(
                    pk=target_profile_id
                )
            )

        except Registration.DoesNotExist:

            return Response(
                {
                    "detail": (
                        "Target profile not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        target_user = target_registration.user

        # -------------------------------------------------
        # PREVENT SELF MESSAGE
        # -------------------------------------------------

        if target_user == request.user:

            return Response(
                {
                    "detail": (
                        "You cannot message yourself."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # -------------------------------------------------
        # KEEP PARTICIPANTS ORDERED
        # -------------------------------------------------

        if request.user.id < target_user.id:

            participant1 = request.user
            participant2 = target_user

        else:

            participant1 = target_user
            participant2 = request.user

        # -------------------------------------------------
        # GET / CREATE CONVERSATION
        # -------------------------------------------------

        conversation, created = (
            Conversation.objects.get_or_create(
                participant1=participant1,
                participant2=participant2
            )
        )

        # -------------------------------------------------
        # OPTIONAL FIRST MESSAGE
        # -------------------------------------------------

        if content:

            Message.objects.create(
                conversation=conversation,
                sender=request.user,
                content=content
            )

            conversation.updated_at = (
                timezone.now()
            )

            conversation.save(
                update_fields=[
                    "updated_at"
                ]
            )

        serializer = ConversationSerializer(
            conversation,
            context={
                "request": request
            }
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK
        )
