from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.db import transaction

from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer
from notifications.emailing import notify_profile_update
from adminpanel.models import ProfileChange, ProfileVerification
from registrations.models import Registration


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