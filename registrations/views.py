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
                data = {
                    "challenge_id": str(active_challenge.pk),
                    "expires_in": max(
                        0,
                        int((active_challenge.expires_at - now).total_seconds()),
                    ),
                    "resend_after": {
                        "email": max(
                            0,
                            int((active_challenge.email_resend_after - now).total_seconds()),
                        ),
                        "mobile": max(
                            0,
                            int((active_challenge.phone_resend_after - now).total_seconds()),
                        ),
                    },
                    "email_verified": active_challenge.email_verified,
                    "mobile_verified": active_challenge.phone_verified,
                    "verification_in_progress": True,
                }
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
        if challenge is None:
            challenge = VerificationChallenge.objects.create(
                email=email,
                phone=phone,
                email_otp_hash=make_password(email_otp),
                phone_otp_hash=make_password(phone_otp),
                email_resend_after=now + cooldown,
                phone_resend_after=now + cooldown,
                expires_at=_otp_expiry(),
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
            challenge.expires_at = _otp_expiry()
            challenge.save()

        failures = []
        for channel, sender, target, otp in (
            ("email", send_email_otp, email, email_otp),
            ("mobile", send_mobile_otp, phone, phone_otp),
        ):
            try:
                sender(target, otp)
            except VerificationDeliveryError as exc:
                logger.warning("Verification %s delivery failed: %s", channel, exc)
                failures.append({"channel": channel, "detail": str(exc)})

        if failures:
            challenge.consumed_at = timezone.now()
            challenge.save(update_fields=["consumed_at"])
            return Response(
                {
                    "detail": (
                        "Verification codes could not be delivered. Configure the "
                        "listed email/SMS settings in Railway, then try again."
                    ),
                    "delivery_errors": failures,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "challenge_id": str(challenge.pk),
                "expires_in": settings.OTP_EXPIRY_SECONDS,
                "resend_after": {
                    "email": settings.OTP_RESEND_COOLDOWN_SECONDS,
                    "mobile": settings.OTP_RESEND_COOLDOWN_SECONDS,
                },
                "email_sent": True,
                "mobile_sent": True,
                "email_verified": False,
                "mobile_verified": False,
            },
            status=status.HTTP_200_OK,
        )


class VerificationCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        challenge_id = request.data.get("challenge_id")
        channel = request.data.get("channel")
        otp = str(request.data.get("otp", "")).strip()
        if channel not in ("email", "mobile") or not otp:
            return Response(
                {"detail": "A verification channel and code are required."},
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
                if challenge.consumed_at or challenge.expires_at <= now:
                    return Response(
                        {"detail": "This verification request has expired. Request new codes."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                field_channel = "phone" if channel == "mobile" else channel
                verified_field = f"{field_channel}_verified"
                attempts_field = f"{field_channel}_attempts"
                hash_field = f"{field_channel}_otp_hash"
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
                    sender(target, otp)
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
                challenge.expires_at = _otp_expiry()
                challenge.save(
                    update_fields=[
                        f"{field_channel}_otp_hash",
                        attempts_field,
                        f"{field_channel}_verified",
                        resend_field,
                        "expires_at",
                    ]
                )
                return Response(
                    {
                        "message": f"A new code was sent to your {channel}.",
                        "expires_in": settings.OTP_EXPIRY_SECONDS,
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

        registration = self.get_object()

        old_status = registration.status
        changed_fields = _changed_profile_fields(
            registration, serializer.validated_data
        )

        # -------------------------------------------------
        # PUBLISHED / APPROVED PROFILE EDIT
        # -------------------------------------------------

        if old_status in [
            Registration.Status.PUBLISHED,
            Registration.Status.APPROVED,
        ]:
            values = dict(serializer.validated_data)
            files = {
                key: values.pop(key)
                for key in ("profile_photo", "identity_document", "additional_document")
                if key in values
            }
            pending_data = {
                key: value.isoformat() if hasattr(value, "isoformat") else value
                for key, value in values.items()
                if isinstance(value, (str, int, float, bool)) or value is None or hasattr(value, "isoformat")
            }
            change, _ = ProfileChange.objects.get_or_create(
                registration=registration,
                status=ProfileChange.Status.PENDING_REVIEW,
                defaults={"user": self.request.user, "previous_status": old_status},
            )
            change.user = self.request.user
            changed = []
            for key, value in pending_data.items():
                old_value = change.pending_data.get(
                    key, getattr(registration, key, None)
                )
                old_value = old_value.isoformat() if hasattr(old_value, "isoformat") else old_value
                if old_value != value:
                    changed.append({"field_name": key, "old_value": old_value, "new_value": value})
            change.pending_data = {**change.pending_data, **pending_data}
            replaced_pending_files = []
            for field, value in files.items():
                previous_file = getattr(change, f"pending_{field}")
                if previous_file:
                    replaced_pending_files.append(previous_file)
                setattr(change, f"pending_{field}", value)
                changed.append({"field_name": field, "new_value": value.name})
            changed_by_field = {item["field_name"]: item for item in change.changed_fields}
            for item in changed:
                old = changed_by_field.get(item["field_name"], {})
                changed_by_field[item["field_name"]] = {**old, **item}
            change.changed_fields = list(changed_by_field.values())
            change.save()
            for previous_file in replaced_pending_files:
                transaction.on_commit(lambda file=previous_file: file.delete(save=False))

            verification, _ = ProfileVerification.objects.get_or_create(client=self.request.user)
            verification.status = ProfileVerification.Status.UNDER_REVIEW
            verification.correction_message = ""
            verification.rejection_reason = ""
            verification.save(update_fields=["status", "correction_message", "rejection_reason", "updated_at"])
            if changed:
                details = list(changed)
                transaction.on_commit(
                    lambda registration=registration, details=details: (
                        notify_profile_update(registration, details)
                    )
                )

        # -------------------------------------------------
        # CORRECTION REQUIRED
        # -------------------------------------------------

        elif old_status == (
            Registration.Status.CORRECTION_REQUIRED
        ):

            serializer.save(
                status=Registration.Status.UNDER_REVIEW,
                correction_reason=""
            )

        else:
            serializer.save()

        if (
            old_status not in [Registration.Status.PUBLISHED, Registration.Status.APPROVED]
            and changed_fields
        ):
            details = list(changed_fields)
            transaction.on_commit(
                lambda registration=registration, details=details: (
                    notify_profile_update(registration, details)
                )
            )

        if old_status not in [Registration.Status.PUBLISHED, Registration.Status.APPROVED]:
            verification, _ = ProfileVerification.objects.get_or_create(client=self.request.user)
            verification.status = (
                ProfileVerification.Status.UNDER_REVIEW
                if old_status == Registration.Status.CORRECTION_REQUIRED
                else ProfileVerification.Status.PENDING
            )
            verification.save(update_fields=["status", "updated_at"])

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

        previous_file_name = registration.horoscope_file.name
        previous_file_storage = registration.horoscope_file.storage
        registration.horoscope_file.save(
            horoscope_file.name,
            horoscope_file,
            save=False,
        )
        registration.save(update_fields=["horoscope_file", "updated_at"])
        if previous_file_name and previous_file_name != registration.horoscope_file.name:
            previous_file_storage.delete(previous_file_name)

        details = [{"field_name": "horoscope_file"}]
        transaction.on_commit(
            lambda registration=registration, details=details: (
                notify_profile_update(registration, details)
            )
        )

        return Response(
            {
                "message": "Horoscope file uploaded successfully.",
                "horoscope_file_url": request.build_absolute_uri(
                    "/api/registrations/my-profile/horoscope/"
                ),
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
        if not registration.horoscope_file:
            return Response(
                {"detail": "No horoscope file has been uploaded."},
                status=status.HTTP_404_NOT_FOUND,
            )

        file_name = registration.horoscope_file.name
        file_storage = registration.horoscope_file.storage
        registration.horoscope_file = None
        registration.save(update_fields=["horoscope_file", "updated_at"])
        file_storage.delete(file_name)
        details = [{"field_name": "horoscope_file_removed"}]
        transaction.on_commit(
            lambda registration=registration, details=details: (
                notify_profile_update(registration, details)
            )
        )
        return Response({"message": "Horoscope file removed successfully."})


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

        # -------------------------------------------------
        # PUBLISHED PROFILE
        # -------------------------------------------------
        # New/replaced photo goes to pending_photo.
        # Existing approved photo remains visible.
        # -------------------------------------------------

        if registration.status in (
            Registration.Status.PUBLISHED,
            Registration.Status.APPROVED,
        ):

            old_pending_photo = client_photo.pending_photo
            client_photo.pending_photo = photo_file

            client_photo.status = (
                ClientPhoto.Status.PENDING
            )

            client_photo.save()
            if old_pending_photo:
                old_pending_photo.delete(save=False)

            change, _ = ProfileChange.objects.get_or_create(
                registration=registration,
                status=ProfileChange.Status.PENDING_REVIEW,
                defaults={"user": request.user, "previous_status": registration.status},
            )
            change.user = request.user
            if not any(item.get("field_name") == "gallery_photo" and item.get("slot_index") == slot_index for item in change.changed_fields):
                change.changed_fields.append({"field_name": "gallery_photo", "slot_index": slot_index})
            change.save()
            verification, _ = ProfileVerification.objects.get_or_create(client=request.user)
            verification.status = ProfileVerification.Status.UNDER_REVIEW
            verification.save(update_fields=["status", "updated_at"])
            details = list(change.changed_fields)
            transaction.on_commit(
                lambda registration=registration, details=details: (
                    notify_profile_update(registration, details)
                )
            )

            message = (
                "New photo uploaded and sent for "
                "admin verification. Existing photo "
                "remains visible until approved."
            )

        # -------------------------------------------------
        # NOT PUBLISHED
        # -------------------------------------------------

        else:

            # Delete old actual file if replacing
            if client_photo.photo:

                client_photo.photo.delete(
                    save=False
                )

            client_photo.photo = photo_file

            client_photo.pending_photo = None

            client_photo.status = (
                ClientPhoto.Status.APPROVED
            )

            client_photo.save()

            # -------------------------------------------------
            # SLOT 1 = MAIN PHOTO
            # -------------------------------------------------

            if (
                slot_index == 1
                or client_photo.is_main
            ):

                ClientPhoto.objects.filter(
                    registration=registration
                ).update(
                    is_main=False
                )

                client_photo.is_main = True

                client_photo.save(
                    update_fields=[
                        "is_main",
                        "updated_at",
                    ]
                )

                registration.profile_photo = (
                    client_photo.photo
                )

                registration.save(
                    update_fields=[
                        "profile_photo",
                        "updated_at",
                    ]
                )

            details = [{"field_name": "gallery_photo", "slot_index": slot_index}]
            transaction.on_commit(
                lambda registration=registration, details=details: (
                    notify_profile_update(registration, details)
                )
            )

            message = (
                "Photo uploaded successfully."
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

            # -------------------------------------------------
            # REMOVE MAIN FROM ALL PHOTOS
            # -------------------------------------------------

            ClientPhoto.objects.filter(
                registration=registration
            ).update(
                is_main=False
            )

            # -------------------------------------------------
            # MAKE SELECTED PHOTO MAIN
            # -------------------------------------------------

            client_photo.is_main = True

            client_photo.save(
                update_fields=[
                    "is_main",
                    "updated_at",
                ]
            )

            # -------------------------------------------------
            # UPDATE REGISTRATION MAIN PHOTO
            # -------------------------------------------------

            registration.profile_photo = (
                client_photo.photo
            )

            registration.save(
                update_fields=[
                    "profile_photo",
                    "updated_at",
                ]
            )

            details = [{"field_name": "profile_photo"}]
            transaction.on_commit(
                lambda registration=registration, details=details: (
                    notify_profile_update(registration, details)
                )
            )

            return Response(
                {
                    "message": (
                        "Main photo updated successfully."
                    )
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
        if not client_photo:
            if slot_index == 1 and registration.profile_photo:
                registration.profile_photo.delete(save=False)
                next_photo = (
                    ClientPhoto.objects.filter(
                        registration=registration,
                        status=ClientPhoto.Status.APPROVED,
                    )
                    .exclude(photo="")
                    .order_by("slot_index")
                    .first()
                )
                ClientPhoto.objects.filter(registration=registration).update(is_main=False)
                if next_photo:
                    next_photo.is_main = True
                    next_photo.save(update_fields=["is_main", "updated_at"])
                    registration.profile_photo = next_photo.photo
                else:
                    registration.profile_photo = None
                registration.save(update_fields=["profile_photo", "updated_at"])
                return Response(
                    {"message": "Photo deleted successfully.", "slot_index": slot_index},
                    status=status.HTTP_200_OK,
                )
            return Response(
                {"detail": "Photo not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        removed_main_photo = bool(
            client_photo.photo and (client_photo.is_main or slot_index == 1)
        )
        if client_photo.photo:
            client_photo.photo.delete(save=False)
        if client_photo.pending_photo:
            client_photo.pending_photo.delete(save=False)
        client_photo.delete()

        if removed_main_photo:
            next_photo = (
                ClientPhoto.objects.filter(
                    registration=registration,
                    status=ClientPhoto.Status.APPROVED,
                )
                .exclude(photo="")
                .order_by("slot_index")
                .first()
            )
            ClientPhoto.objects.filter(registration=registration).update(is_main=False)
            if next_photo:
                next_photo.is_main = True
                next_photo.save(update_fields=["is_main", "updated_at"])
                registration.profile_photo = next_photo.photo
            else:
                registration.profile_photo = None
            registration.save(update_fields=["profile_photo", "updated_at"])

        details = [{"field_name": "gallery_photo_removed", "slot_index": slot_index}]
        transaction.on_commit(
            lambda registration=registration, details=details: (
                notify_profile_update(registration, details)
            )
        )

        return Response(
            {
                "message": "Photo deleted successfully.",
                "slot_index": slot_index,
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
