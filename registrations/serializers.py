from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from PIL import Image, UnidentifiedImageError

from .models import (
    Registration,
    VerificationChallenge,
    ProfileView,
    Interest,
    Shortlist,
    ClientPhoto,
    Conversation,
    Message,
)
from notifications.emailing import (
    notify_admin_new_registration,
    notify_registration_completed,
)


User = get_user_model()


def validate_upload(value, image, max_bytes):
    if value is None:
        return value
    if value.size > max_bytes:
        raise serializers.ValidationError("File exceeds the allowed size limit.")
    allowed = (".jpg", ".jpeg", ".png", ".webp") if image else (".pdf", ".jpg", ".jpeg", ".png")
    if not value.name.lower().endswith(allowed):
        raise serializers.ValidationError("Unsupported file type.")
    extension = value.name.lower().rsplit(".", 1)[-1]
    if extension == "pdf":
        if value.read(5) != b"%PDF-":
            raise serializers.ValidationError("The uploaded document is not a valid PDF.")
        value.seek(0)
    else:
        try:
            image_file = Image.open(value)
            image_file.verify()
            value.seek(0)
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
            raise serializers.ValidationError("The uploaded file is not a valid image.") from None
    return value


def absolute_file_url(request, file_field):
    if not file_field:
        return None
    url = file_field.url
    return request.build_absolute_uri(url) if request else url


# =========================================================
# REGISTRATION SERIALIZER
# =========================================================

class RegistrationSerializer(serializers.ModelSerializer):

    email = serializers.EmailField(
        write_only=True
    )

    password = serializers.CharField(
        write_only=True,
        min_length=6
    )

    verification_token = serializers.UUIDField(write_only=True)

    class Meta:
        model = Registration

        fields = [
            "id",
            "matrimony_id",
            "full_name",
            "gender",
            "date_of_birth",
            "religion",
            "caste",
            "marital_status",
            "height",
            "disability",
            "address",
            "city",
            "district",
            "state",
            "education_level",
            "education",
            "highest_education",
            "occupation_level",
            "occupation",
            "company",
            "income",
            "work_location",
            "working_place",
            "phone",
            "alternate_phone",
            "source",
            "about",
            "profile_photo",
            "identity_document",
            "additional_document",
            "father_name",
            "father_occupation",
            "mother_name",
            "mother_occupation",
            "brothers",
            "married_brothers",
            "sisters",
            "married_sisters",
            "financial_level",
            "about_family",
            "place",
            "house_name",
            "bus_stop",
            "post_office",
            "taluk",
            "village",
            "contact_name",
            "relationship",
            "country_code",
            "contact_phone",
            "extra_phone",
            "status",
            "correction_reason",
            "rejection_reason",
            "verified_by",
            "verified_at",
            "published_at",
            "created_at",
            "updated_at",
            "email",
            "password",
            "verification_token",
        ]

        read_only_fields = [
            "id",
            "matrimony_id",
            "status",
            "correction_reason",
            "rejection_reason",
            "verified_by",
            "verified_at",
            "published_at",
            "created_at",
            "updated_at",
        ]

    def validate_profile_photo(self, value):
        validate_upload(value, image=True, max_bytes=5 * 1024 * 1024)
        return value

    def validate_identity_document(self, value):
        validate_upload(value, image=False, max_bytes=10 * 1024 * 1024)
        return value

    def validate_additional_document(self, value):
        validate_upload(value, image=False, max_bytes=10 * 1024 * 1024)
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "This email address is already registered. Please log in or use a different email address."
            )
        return value

    def validate_phone(self, value):
        value = value.strip()
        if value and Registration.objects.filter(phone__iexact=value).exists():
            raise serializers.ValidationError(
                "This phone number is already registered. Please use a different number."
            )
        return value or None

    def validate(self, attrs):
        phone = attrs.get("phone")
        if not phone:
            raise serializers.ValidationError(
                {"phone": "A verified mobile number is required."}
            )
        challenge = VerificationChallenge.objects.filter(
            pk=attrs["verification_token"],
            email=attrs["email"],
            phone=phone,
            email_verified=True,
            phone_verified=True,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).first()
        if challenge is None:
            raise serializers.ValidationError(
                {
                    "verification_token": (
                        "Verify both your email and mobile number before completing registration."
                    )
                }
            )
        attrs["_verification_challenge"] = challenge
        return attrs

    def create(self, validated_data):
        email = validated_data.pop("email").strip().lower()
        password = validated_data.pop("password")
        validated_data.pop("verification_token")
        verification_challenge = validated_data.pop("_verification_challenge")
        try:
            with transaction.atomic():
                challenge = VerificationChallenge.objects.select_for_update().get(
                    pk=verification_challenge.pk
                )
                if (
                    challenge.consumed_at
                    or challenge.expires_at <= timezone.now()
                    or not challenge.email_verified
                    or not challenge.phone_verified
                    or challenge.email != email
                    or challenge.phone != validated_data.get("phone")
                ):
                    raise serializers.ValidationError(
                        {
                            "verification_token": (
                                "The contact verification has expired or was already used. Verify both contacts again."
                            )
                        }
                    )
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    full_name=validated_data.get("full_name", ""),
                    role=User.Role.CLIENT,
                )
                registration = Registration.objects.create(user=user, **validated_data)
                challenge.consumed_at = timezone.now()
                challenge.save(update_fields=["consumed_at"])
                transaction.on_commit(
                    lambda registration=registration: (
                        notify_registration_completed(registration),
                        notify_admin_new_registration(registration),
                    )
                )
                return registration
        except IntegrityError:
            if User.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError({"email": "This email address is already registered. Please log in or use a different email address."}) from None
            phone = validated_data.get("phone")
            if phone and Registration.objects.filter(phone__iexact=phone).exists():
                raise serializers.ValidationError({"phone": "This phone number is already registered. Please use a different number."}) from None
            raise


# =========================================================
# PUBLIC PROFILE SERIALIZER
# =========================================================

class PublicProfileSerializer(serializers.ModelSerializer):

    age = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Registration

        fields = [
            "id",
            "matrimony_id",
            "full_name",
            "gender",
            "date_of_birth",
            "age",
            "religion",
            "caste",
            "marital_status",
            "height",
            "disability",
            "education_level",
            "education",
            "highest_education",
            "occupation_level",
            "occupation",
            "company",
            "income",
            "work_location",
            "working_place",
            "city",
            "district",
            "state",
            "about",
            "profile_photo_url",
            "father_name",
            "father_occupation",
            "mother_name",
            "mother_occupation",
            "brothers",
            "married_brothers",
            "sisters",
            "married_sisters",
            "financial_level",
            "about_family",
            "place",
            "house_name",
            "status",
        ]

    def get_age(self, obj):
        from datetime import date
        if not obj.date_of_birth:
            return None
        today = date.today()
        return (
            today.year
            - obj.date_of_birth.year
            - ((today.month, today.day) < (obj.date_of_birth.month, obj.date_of_birth.day))
        )

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if obj.profile_photo:
            url = obj.profile_photo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


# =========================================================
# CLIENT PROFILE SERIALIZER
# =========================================================

class ClientProfileSerializer(serializers.ModelSerializer):

    age = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()
    horoscope_file_url = serializers.SerializerMethodField()
    identity_document_url = serializers.SerializerMethodField()
    additional_document_url = serializers.SerializerMethodField()
    pending_data = serializers.SerializerMethodField()
    pending_profile_photo_url = serializers.SerializerMethodField()
    pending_identity_document_url = serializers.SerializerMethodField()
    pending_additional_document_url = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    def validate_profile_photo(self, value):
        return validate_upload(value, image=True, max_bytes=5 * 1024 * 1024)

    def validate_identity_document(self, value):
        return validate_upload(value, image=False, max_bytes=10 * 1024 * 1024)

    def validate_additional_document(self, value):
        return validate_upload(value, image=False, max_bytes=10 * 1024 * 1024)

    class Meta:
        model = Registration

        fields = [
            "id",
            "matrimony_id",
            "full_name",
            "gender",
            "date_of_birth",
            "age",
            "religion",
            "caste",
            "marital_status",
            "height",
            "disability",
            "address",
            "city",
            "district",
            "state",
            "education_level",
            "education",
            "highest_education",
            "occupation_level",
            "occupation",
            "company",
            "income",
            "work_location",
            "working_place",
            "phone",
            "alternate_phone",
            "source",
            "about",
            "profile_photo",
            "profile_photo_url",
            "horoscope_file_url",
            "identity_document",
            "identity_document_url",
            "additional_document",
            "additional_document_url",
            "pending_data",
            "pending_profile_photo_url",
            "pending_identity_document_url",
            "pending_additional_document_url",
            "father_name",
            "father_occupation",
            "mother_name",
            "mother_occupation",
            "brothers",
            "married_brothers",
            "sisters",
            "married_sisters",
            "financial_level",
            "about_family",
            "place",
            "house_name",
            "bus_stop",
            "post_office",
            "taluk",
            "village",
            "contact_name",
            "relationship",
            "country_code",
            "contact_phone",
            "extra_phone",
            "status",
            "correction_reason",
            "rejection_reason",
            "created_at",
            "updated_at",
            "published_at",
        ]

        read_only_fields = [
            "id",
            "matrimony_id",
            "age",
            "profile_photo_url",
            "horoscope_file_url",
            "identity_document_url",
            "additional_document_url",
            "pending_data",
            "pending_profile_photo_url",
            "pending_identity_document_url",
            "pending_additional_document_url",
            "status",
            "correction_reason",
            "rejection_reason",
            "created_at",
            "updated_at",
            "published_at",
        ]

    def get_age(self, obj):
        from datetime import date
        if not obj.date_of_birth:
            return None
        today = date.today()
        return (
            today.year
            - obj.date_of_birth.year
            - ((today.month, today.day) < (obj.date_of_birth.month, obj.date_of_birth.day))
        )

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if obj.profile_photo:
            url = obj.profile_photo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None

    def get_horoscope_file_url(self, obj):
        if not obj.horoscope_file:
            return None
        request = self.context.get("request")
        path = "/api/registrations/my-profile/horoscope/"
        return request.build_absolute_uri(path) if request else path

    def get_identity_document_url(self, obj):
        return self._client_file_url(obj, "client-identity-document")

    def get_additional_document_url(self, obj):
        return self._client_file_url(obj, "client-additional-document")

    def _client_file_url(self, obj, kind):
        request = self.context.get("request")
        if not getattr(obj, "identity_document" if "identity" in kind else "additional_document"):
            return None
        path = f"/api/registrations/pending-files/{kind}/{obj.pk}/"
        return request.build_absolute_uri(path) if request else path

    def _pending_change(self, obj):
        return obj.profile_changes.filter(
            status__in=("PENDING_REVIEW", "CORRECTION_REQUIRED", "REJECTED")
        ).first()

    def _latest_change(self, obj):
        return obj.profile_changes.exclude(status="APPROVED").first()

    def get_pending_data(self, obj):
        change = self._pending_change(obj)
        return change.pending_data if change else {}

    def get_pending_profile_photo_url(self, obj):
        change = self._pending_change(obj)
        if not change or not change.pending_profile_photo:
            return None
        request = self.context.get("request")
        path = f"/api/registrations/pending-files/profile-photo/{change.pk}/"
        return request.build_absolute_uri(path) if request else path

    def _pending_file_url(self, obj, field):
        change = self._pending_change(obj)
        if not change or not getattr(change, f"pending_{field}"):
            return None
        request = self.context.get("request")
        path = f"/api/registrations/pending-files/{field.replace('_', '-')}/{change.pk}/"
        return request.build_absolute_uri(path) if request else path

    def get_pending_identity_document_url(self, obj):
        return self._pending_file_url(obj, "identity_document")

    def get_pending_additional_document_url(self, obj):
        return self._pending_file_url(obj, "additional_document")

    def get_status(self, obj):
        change = self._latest_change(obj)
        if change and change.status == "PENDING_REVIEW":
            return "UNDER_REVIEW"
        if change and change.status in ("CORRECTION_REQUIRED", "REJECTED"):
            return change.status
        return obj.status


# =========================================================
# PROFILE VIEW SERIALIZER
# =========================================================

class ProfileViewSerializer(serializers.ModelSerializer):

    profile_name = serializers.CharField(
        source="viewed_profile.full_name",
        read_only=True
    )

    matrimony_id = serializers.CharField(
        source="viewed_profile.matrimony_id",
        read_only=True
    )

    city = serializers.CharField(
        source="viewed_profile.city",
        read_only=True
    )

    district = serializers.CharField(
        source="viewed_profile.district",
        read_only=True
    )

    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ProfileView

        fields = [
            "id",
            "profile_name",
            "matrimony_id",
            "city",
            "district",
            "profile_photo_url",
            "viewed_at",
        ]

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if obj.viewed_profile and obj.viewed_profile.profile_photo:
            url = obj.viewed_profile.profile_photo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


# =========================================================
# INTEREST SERIALIZER
# =========================================================

class InterestSerializer(serializers.ModelSerializer):

    profile_id = serializers.SerializerMethodField()
    profile_name = serializers.SerializerMethodField()
    matrimony_id = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    city = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Interest

        fields = [
            "id",
            "profile_id",
            "profile_name",
            "matrimony_id",
            "age",
            "city",
            "profile_photo_url",
            "status",
            "created_at",
        ]

    def get_registration(self, user):
        return user.registrations.order_by("-created_at").first()

    def get_target_registration(self, obj):
        request = self.context.get("request")
        if request and obj.sender == request.user:
            return self.get_registration(obj.receiver)
        else:
            return self.get_registration(obj.sender)

    def get_profile_id(self, obj):
        reg = self.get_target_registration(obj)
        return reg.id if reg else None

    def get_profile_name(self, obj):
        reg = self.get_target_registration(obj)
        return reg.full_name if reg else None

    def get_matrimony_id(self, obj):
        reg = self.get_target_registration(obj)
        return reg.matrimony_id if reg else None

    def get_age(self, obj):
        from datetime import date
        reg = self.get_target_registration(obj)
        if reg and reg.date_of_birth:
            today = date.today()
            dob = reg.date_of_birth
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return None

    def get_city(self, obj):
        reg = self.get_target_registration(obj)
        return reg.city if reg else None

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        reg = self.get_target_registration(obj)
        if reg and reg.profile_photo:
            url = reg.profile_photo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


# =========================================================
# SHORTLIST SERIALIZER
# =========================================================

class ShortlistSerializer(serializers.ModelSerializer):

    profile_id = serializers.IntegerField(
        source="profile.id",
        read_only=True
    )

    profile_name = serializers.CharField(
        source="profile.full_name",
        read_only=True
    )

    matrimony_id = serializers.CharField(
        source="profile.matrimony_id",
        read_only=True
    )

    age = serializers.SerializerMethodField()

    city = serializers.CharField(
        source="profile.city",
        read_only=True
    )

    district = serializers.CharField(
        source="profile.district",
        read_only=True
    )

    education = serializers.CharField(
        source="profile.education",
        read_only=True
    )

    occupation = serializers.CharField(
        source="profile.occupation",
        read_only=True
    )

    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Shortlist

        fields = [
            "id",
            "profile_id",
            "profile_name",
            "matrimony_id",
            "age",
            "city",
            "district",
            "education",
            "occupation",
            "profile_photo_url",
            "created_at",
        ]

    def get_age(self, obj):
        from datetime import date
        if not obj.profile or not obj.profile.date_of_birth:
            return None
        today = date.today()
        dob = obj.profile.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if obj.profile and obj.profile.profile_photo:
            url = obj.profile.profile_photo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


# =========================================================
# CLIENT PHOTO SERIALIZER
# =========================================================

class ClientPhotoSerializer(serializers.ModelSerializer):

    photo_url = serializers.SerializerMethodField()
    pending_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ClientPhoto
        fields = [
            "id",
            "slot_index",
            "is_main",
            "status",
            "photo_url",
            "pending_photo_url",
            "created_at",
            "updated_at",
        ]

    def get_photo_url(self, obj):
        request = self.context.get("request")
        if obj.photo:
            url = obj.photo.url
            return request.build_absolute_uri(url) if request else url
        return None

    def get_pending_photo_url(self, obj):
        request = self.context.get("request")
        if obj.pending_photo:
            path = f"/api/registrations/pending-files/gallery-photo/{obj.pk}/"
            return request.build_absolute_uri(path) if request else path
        return None


# =========================================================
# CONVERSATION & MESSAGE SERIALIZERS
# =========================================================

class MessageSerializer(serializers.ModelSerializer):

    sender_name = serializers.CharField(
        source="sender.full_name",
        read_only=True
    )
    is_me = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "content",
            "is_read",
            "is_me",
            "created_at",
        ]

    def get_is_me(self, obj):
        request = self.context.get("request")
        if request and request.user:
            return obj.sender == request.user
        return False


class ConversationSerializer(serializers.ModelSerializer):

    other_participant = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "other_participant",
            "last_message",
            "unread_count",
            "created_at",
            "updated_at",
        ]

    def get_other_participant(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        other_user = obj.participant2 if user == obj.participant1 else obj.participant1

        reg = getattr(other_user, "registrations", None)
        registration = reg.order_by("-created_at").first() if reg else None

        photo_url = None
        if registration and registration.profile_photo:
            url = registration.profile_photo.url
            photo_url = request.build_absolute_uri(url) if request else url

        return {
            "id": other_user.id,
            "full_name": registration.full_name if registration else other_user.full_name,
            "matrimony_id": registration.matrimony_id if registration else None,
            "profile_id": registration.id if registration else None,
            "photo_url": photo_url,
        }

    def get_last_message(self, obj):
        last_msg = obj.messages.order_by("-created_at").first()
        if last_msg:
            return {
                "id": last_msg.id,
                "content": last_msg.content,
                "sender_id": last_msg.sender_id,
                "created_at": last_msg.created_at,
            }
        return None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if request and request.user:
            return obj.messages.filter(is_read=False).exclude(sender=request.user).count()
        return 0