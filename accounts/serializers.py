from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import User
from adminpanel.models import ProfileVerification


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        max_length=128,
    )

    def validate_new_password(self, value):
        try:
            validate_password(value, user=self.context["user"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")

        # ==========================================
        # FIND USER USING USERNAME OR EMAIL
        # ==========================================
        user = User.objects.filter(username=username).first()

        if not user:
            user = User.objects.filter(email=username).first()

        if not user:
            raise serializers.ValidationError({
                "detail": "Invalid email or password."
            })

        # ==========================================
        # PASSWORD CHECK
        # ==========================================
        if not user.check_password(password):
            raise serializers.ValidationError({
                "detail": "Invalid email or password."
            })

        # ==========================================
        # ACCOUNT ACTIVE CHECK
        # ==========================================
        if not user.is_active:
            raise serializers.ValidationError({
                "detail": "This account is inactive."
            })

        # ==========================================
        # CLIENT VERIFICATION CHECK
        # ==========================================
        if user.role == User.Role.CLIENT:

            verification = ProfileVerification.objects.filter(
                client=user
            ).order_by("-submitted_at").first()

            # No verification record
            if not verification:
                raise serializers.ValidationError({
                    "detail": "Your registration has not been submitted for verification yet."
                })

            # Pending
            if verification.status == ProfileVerification.Status.PENDING:
                raise serializers.ValidationError({
                    "detail": "Your registration is currently pending admin approval. Please wait until your profile is approved."
                })

            # Under review
            if verification.status == ProfileVerification.Status.UNDER_REVIEW:
                raise serializers.ValidationError({
                    "detail": "Your profile is currently under review by our admin team. Please wait for approval."
                })

            # Correction required
            if verification.status == ProfileVerification.Status.CORRECTION_REQUIRED:
                raise serializers.ValidationError({
                    "detail": "Correction is required in your profile. Please contact our support team."
                })

            # Rejected
            if verification.status == ProfileVerification.Status.REJECTED:
                raise serializers.ValidationError({
                    "detail": "Your registration has been rejected. Please contact our support team."
                })

            # Only APPROVED is allowed
            if verification.status != ProfileVerification.Status.APPROVED:
                raise serializers.ValidationError({
                    "detail": "Your profile has not been approved yet."
                })

        # ==========================================
        # LOGIN ALLOWED
        # ==========================================
        attrs["user"] = user

        return attrs