from django.utils import timezone
from django.db import transaction
from pathlib import Path

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdmin
from registrations.models import ClientPhoto, Registration

from .models import ProfileVerification
from .serializers import (
    ProfileVerificationSerializer,
    RegistrationCheckingSerializer,
)
from .models import ProfileChange
from notifications.emailing import (
    notify_client_approval,
    notify_client_decision,
)
import logging
from datetime import date

logger = logging.getLogger(__name__)


def pending_change(registration):
    return ProfileChange.objects.filter(
        registration=registration,
        status=ProfileChange.Status.PENDING_REVIEW,
    ).first()


def pending_gallery_photos(registration):
    return registration.photos.exclude(
        pending_photo=""
    ).exclude(pending_photo__isnull=True)


def registration_payload(registration, request, change=None):
    data = RegistrationCheckingSerializer(registration, context={"request": request}).data
    for field in ("identity_document", "additional_document"):
        if getattr(registration, field):
            kind = "client-" + field.replace("_", "-")
            data[field] = request.build_absolute_uri(f"/api/registrations/pending-files/{kind}/{registration.pk}/")
    if change:
        data.update(change.pending_data)
        if change.pending_profile_photo:
            data["profile_photo"] = request.build_absolute_uri(f"/api/registrations/pending-files/profile-photo/{change.pk}/")
        for field in ("identity_document", "additional_document"):
            pending_file = getattr(change, f"pending_{field}")
            if pending_file:
                kind = field.replace("_", "-")
                data[field] = request.build_absolute_uri(f"/api/registrations/pending-files/{kind}/{change.pk}/")
        data["status"] = "UNDER_REVIEW"
        data["pending_change_id"] = change.pk
    return data


class AdminRegistrationListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        registrations = Registration.objects.select_related("user").all()

        data = []

        for registration in registrations:
            change = pending_change(registration)
            latest_change = registration.profile_changes.exclude(status=ProfileChange.Status.APPROVED).first()
            verification, created = ProfileVerification.objects.get_or_create(
                client=registration.user,
                defaults={
                    "status": (
                        ProfileVerification.Status.APPROVED
                        if registration.status == Registration.Status.APPROVED
                        else ProfileVerification.Status.PENDING
                    )
                },
            )
            if change:
                desired_status = ProfileVerification.Status.UNDER_REVIEW
            elif latest_change and latest_change.status in (ProfileChange.Status.CORRECTION_REQUIRED, ProfileChange.Status.REJECTED):
                desired_status = latest_change.status
            elif registration.status in (Registration.Status.APPROVED, Registration.Status.PUBLISHED):
                desired_status = ProfileVerification.Status.APPROVED
            else:
                desired_status = registration.status
            if verification.status != desired_status:
                verification.status = desired_status
                verification.save(update_fields=["status", "updated_at"])

            data.append({
                "verification": ProfileVerificationSerializer(
                    verification
                ).data,
                "registration": RegistrationCheckingSerializer(
                    registration
                ).data,
                "has_pending_changes": bool(change),
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
        change = pending_change(registration)
        if change:
            verification.status = ProfileVerification.Status.UNDER_REVIEW
            verification.save(update_fields=["status", "updated_at"])

        pending_photos = []
        if change:
            for photo in pending_gallery_photos(registration):
                pending_photos.append({
                    "slot_index": photo.slot_index,
                    "url": request.build_absolute_uri(f"/api/registrations/pending-files/gallery-photo/{photo.pk}/"),
                })

        return Response({
            "verification": ProfileVerificationSerializer(
                verification
            ).data,
            "registration": registration_payload(registration, request, change),
            "pending_change": ({
                "id": change.pk,
                "changed_fields": change.changed_fields,
                "pending_data": change.pending_data,
                "created_at": change.created_at,
            } if change else None),
            "pending_photos": pending_photos,
        })


class AdminApproveRegistrationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            return self._approve_registration(request, pk)
        except Exception:
            logger.exception(
                "Registration approval failed (registration_id=%s, admin_id=%s)",
                pk,
                request.user.pk,
            )
            return Response(
                {
                    "detail": "Approval could not be completed. Please try again later.",
                    "code": "approval_failed",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _approve_registration(self, request, pk):
        try:
            registration = Registration.objects.get(pk=pk)
        except Registration.DoesNotExist:
            return Response(
                {"detail": "Registration not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        change = pending_change(registration)
        if not change and registration.status in (Registration.Status.APPROVED, Registration.Status.PUBLISHED):
            return Response({
                "message": "Registration is already approved or published.",
                "status": registration.status,
                "matrimony_id": registration.matrimony_id,
            })
        if change and change.user_id != registration.user_id:
            logger.error(
                "Cannot approve registration %s: pending change %s belongs to a different user.",
                registration.pk,
                change.pk,
            )
            return Response(
                {
                    "detail": "The pending profile change does not match this registration owner.",
                    "code": "invalid_pending_change",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if change:
            missing_uploads = []
            for field in ("pending_profile_photo", "pending_identity_document", "pending_additional_document"):
                pending_file = getattr(change, field)
                if pending_file and not pending_file.storage.exists(pending_file.name):
                    missing_uploads.append(field.removeprefix("pending_").replace("_", " "))
            for photo in pending_gallery_photos(registration):
                if photo.pending_photo and not photo.pending_photo.storage.exists(photo.pending_photo.name):
                    missing_uploads.append(f"gallery photo {photo.slot_index}")
            if missing_uploads:
                logger.error(
                    "Cannot approve registration %s: pending media is missing: %s",
                    registration.pk,
                    ", ".join(missing_uploads),
                )
                return Response(
                    {
                        "detail": (
                            "Approval could not complete because pending upload files are missing "
                            f"from media storage: {', '.join(missing_uploads)}. "
                            "Keep a persistent Railway Volume mounted for Django media and ask the client to re-upload the missing files."
                        ),
                        "code": "pending_media_missing",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        was_published_update = bool(change and change.previous_status == Registration.Status.PUBLISHED)
        with transaction.atomic():
            if change:
                pending_to_delete = []
                has_pending_profile_photo = bool(change.pending_profile_photo)
                has_pending_main_gallery_photo = pending_gallery_photos(registration).filter(slot_index=1).exists()
                for field, value in change.pending_data.items():
                    if hasattr(registration, field):
                        if field == "date_of_birth" and isinstance(value, str):
                            value = date.fromisoformat(value)
                        setattr(registration, field, value)
                for field in ("profile_photo", "identity_document", "additional_document"):
                    pending_file = getattr(change, f"pending_{field}")
                    if pending_file:
                        pending_file.open("rb")
                        getattr(registration, field).save(Path(pending_file.name).name, pending_file.file, save=False)
                        pending_to_delete.append(pending_file)
                        setattr(change, f"pending_{field}", None)
                registration.status = (
                    Registration.Status.PUBLISHED if was_published_update else Registration.Status.APPROVED
                )
                for photo in pending_gallery_photos(registration):
                    pending_file = photo.pending_photo
                    pending_file.open("rb")
                    photo.photo.save(Path(pending_file.name).name, pending_file.file, save=False)
                    photo.pending_photo = None
                    photo.status = photo.Status.APPROVED
                    photo.save()
                    pending_file.delete(save=False)
                    if photo.is_main:
                        registration.profile_photo = photo.photo
                registration.save()
                if has_pending_profile_photo and not has_pending_main_gallery_photo:
                    main_photo, _ = ClientPhoto.objects.get_or_create(registration=registration, slot_index=1, defaults={"is_main": True})
                    main_photo.photo.save(Path(registration.profile_photo.name).name, registration.profile_photo.file, save=False)
                    main_photo.is_main = True
                    main_photo.status = ClientPhoto.Status.APPROVED
                    main_photo.save()
                    registration.profile_photo = main_photo.photo
                    registration.save(update_fields=["profile_photo", "updated_at"])
                for pending_file in pending_to_delete:
                    pending_file.delete(save=False)
                change.status = ProfileChange.Status.APPROVED
                change.reviewed_by = request.user
                change.reviewed_at = timezone.now()
                change.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at", "pending_profile_photo", "pending_identity_document", "pending_additional_document"])
            else:
                registration.status = Registration.Status.APPROVED
                registration.verified_by = request.user
                registration.verified_at = timezone.now()
                registration.save(update_fields=["status", "verified_by", "verified_at", "updated_at"])

            verification, _ = ProfileVerification.objects.get_or_create(client=registration.user)
            verification.status = ProfileVerification.Status.APPROVED
            verification.assigned_admin = request.user
            verification.correction_message = ""
            verification.rejection_reason = ""
            verification.reviewed_at = timezone.now()
            verification.save()
            if was_published_update:
                transaction.on_commit(lambda: notify_client_approval(registration, updated=True))

        if was_published_update:
            return Response({
                "message": "Updated profile approved and published.",
                "status": registration.status,
                "matrimony_id": registration.matrimony_id,
            })

        return Response({
            "message": "Registration approved successfully.",
            "status": registration.status,
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

        if verification.status == ProfileVerification.Status.CORRECTION_REQUIRED and not pending_change(registration):
            return Response({"message": "Correction has already been requested.", "status": verification.status})

        verification.status = (
            ProfileVerification.Status.CORRECTION_REQUIRED
        )
        verification.assigned_admin = request.user
        verification.correction_message = message
        verification.reviewed_at = timezone.now()
        verification.save()
        change = pending_change(registration)
        if change:
            change.status = ProfileChange.Status.CORRECTION_REQUIRED
            change.correction_message = message
            change.reviewed_by = request.user
            change.reviewed_at = timezone.now()
            change.save(update_fields=["status", "correction_message", "reviewed_by", "reviewed_at", "updated_at"])

        keep_published = bool(change and change.previous_status == Registration.Status.PUBLISHED)
        if not keep_published:
            registration.status = Registration.Status.CORRECTION_REQUIRED

        registration.save(
            update_fields=[
                "status",
                "updated_at",
            ]
        )
        transaction.on_commit(lambda: notify_client_decision(registration, "CORRECTION_REQUIRED", message))

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

        if verification.status == ProfileVerification.Status.REJECTED and not pending_change(registration):
            return Response({"message": "Registration is already rejected.", "status": verification.status})

        verification.status = ProfileVerification.Status.REJECTED
        verification.assigned_admin = request.user
        verification.rejection_reason = reason
        verification.reviewed_at = timezone.now()
        verification.save()
        change = pending_change(registration)
        if change:
            change.status = ProfileChange.Status.REJECTED
            change.rejection_reason = reason
            change.reviewed_by = request.user
            change.reviewed_at = timezone.now()
            change.save(update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"])

        keep_published = bool(change and change.previous_status == Registration.Status.PUBLISHED)
        if not keep_published:
            registration.status = Registration.Status.REJECTED
        registration.rejection_reason = reason

        registration.save(update_fields=["status", "rejection_reason", "updated_at"])
        transaction.on_commit(lambda: notify_client_decision(registration, "REJECTED", reason))

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
        verification.status = ProfileVerification.Status.APPROVED
        verification.assigned_admin = request.user
        verification.reviewed_at = timezone.now()
        verification.save(update_fields=["status", "assigned_admin", "reviewed_at", "updated_at"])
        transaction.on_commit(lambda: notify_client_approval(registration, updated=False))

        return Response({
            "message": "Registration published successfully.",
            "status": registration.status,
            "matrimony_id": registration.matrimony_id,
        })
