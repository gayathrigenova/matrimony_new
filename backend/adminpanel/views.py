from django.utils import timezone
from django.db.models import OuterRef, Subquery

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdmin
from registrations.models import Registration

from .models import ProfileVerification
from .serializers import (
    ProfileVerificationSerializer,
    RegistrationCheckingSerializer,
)


class AdminRegistrationListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        latest_registration = Registration.objects.filter(
            user_id=OuterRef("user_id")
        ).order_by("-created_at", "-id").values("id")[:1]
        registrations = Registration.objects.filter(
            id=Subquery(latest_registration)
        ).select_related("user")

        data = []

        for registration in registrations:
            verification_status = {
                Registration.Status.PENDING: ProfileVerification.Status.PENDING,
                Registration.Status.UNDER_REVIEW: ProfileVerification.Status.UNDER_REVIEW,
                Registration.Status.CORRECTION_REQUIRED: ProfileVerification.Status.CORRECTION_REQUIRED,
                Registration.Status.APPROVED: ProfileVerification.Status.APPROVED,
                Registration.Status.PUBLISHED: ProfileVerification.Status.APPROVED,
                Registration.Status.REJECTED: ProfileVerification.Status.REJECTED,
            }.get(registration.status, ProfileVerification.Status.PENDING)
            verification, created = ProfileVerification.objects.get_or_create(
                client=registration.user,
                defaults={
                    "status": verification_status,
                },
            )

            if verification.status != verification_status:
                verification.status = verification_status
                verification.save(update_fields=["status", "updated_at"])

            data.append({
                "verification": ProfileVerificationSerializer(
                    verification
                ).data,
                "registration": RegistrationCheckingSerializer(
                    registration,
                    context={"request": request},
                ).data,
            })

        return Response(data)


class AdminRegistrationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            registration = Registration.objects.select_related(
                "user"
            ).get(pk=pk)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        verification, created = ProfileVerification.objects.get_or_create(
            client=registration.user
        )

        return Response({
            "verification": ProfileVerificationSerializer(
                verification
            ).data,
            "registration": RegistrationCheckingSerializer(
                registration,
                context={"request": request},
            ).data,
        })


class AdminApproveRegistrationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            registration = Registration.objects.get(pk=pk)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        verification, created = ProfileVerification.objects.get_or_create(
            client=registration.user
        )

        verification.status = ProfileVerification.Status.APPROVED
        verification.assigned_admin = request.user
        verification.correction_message = ""
        verification.rejection_reason = ""
        verification.reviewed_at = timezone.now()
        verification.save()

        registration.status = Registration.Status.APPROVED
        registration.verified_by = request.user
        registration.verified_at = timezone.now()

        registration.save(
            update_fields=[
                "status",
                "verified_by",
                "verified_at",
                "updated_at",
            ]
        )

        return Response({
            "message": "Registration approved successfully.",
            "status": verification.status,
            "matrimony_id": registration.matrimony_id,
        })


class AdminCorrectionRegistrationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            registration = Registration.objects.get(pk=pk)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        message = request.data.get("correction_message")

        if not message:
            return Response(
                {"detail": "Correction message is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verification, created = ProfileVerification.objects.get_or_create(
            client=registration.user
        )

        verification.status = (
            ProfileVerification.Status.CORRECTION_REQUIRED
        )
        verification.assigned_admin = request.user
        verification.correction_message = message
        verification.reviewed_at = timezone.now()
        verification.save()

        registration.status = Registration.Status.CORRECTION_REQUIRED

        registration.save(
            update_fields=[
                "status",
                "updated_at",
            ]
        )

        return Response({
            "message": "Correction requested successfully.",
            "status": verification.status,
        })


class AdminRejectRegistrationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            registration = Registration.objects.get(pk=pk)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        reason = request.data.get("rejection_reason")

        if not reason:
            return Response(
                {"detail": "Rejection reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verification, created = ProfileVerification.objects.get_or_create(
            client=registration.user
        )

        verification.status = ProfileVerification.Status.REJECTED
        verification.assigned_admin = request.user
        verification.rejection_reason = reason
        verification.reviewed_at = timezone.now()
        verification.save()

        registration.status = Registration.Status.REJECTED
        registration.rejection_reason = reason

        registration.save(
            update_fields=[
                "status",
                "rejection_reason",
                "updated_at",
            ]
        )

        return Response({
            "message": "Registration rejected successfully.",
            "status": verification.status,
        })


class AdminPublishRegistrationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            registration = Registration.objects.get(pk=pk)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if registration.status != Registration.Status.APPROVED:
            return Response(
                {
                    "detail": (
                        "Only approved registrations "
                        "can be published."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        verification, created = ProfileVerification.objects.get_or_create(
            client=registration.user
        )

        verification.status = ProfileVerification.Status.APPROVED
        verification.assigned_admin = request.user
        verification.reviewed_at = timezone.now()
        verification.save()

        registration.status = Registration.Status.PUBLISHED
        registration.published_at = timezone.now()

        registration.save(
            update_fields=[
                "status",
                "published_at",
                "updated_at",
            ]
        )

        return Response({
            "message": "Registration published successfully.",
            "status": registration.status,
            "matrimony_id": registration.matrimony_id,
        })
