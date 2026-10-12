from django.db import models
from django.conf import settings


class ProfileVerification(models.Model):

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        CORRECTION_REQUIRED = "CORRECTION_REQUIRED", "Correction Required"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    # Client being verified
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="verification_records",
        limit_choices_to={"role": "CLIENT"},
    )

    # Admin responsible for checking
    assigned_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_verifications",
        limit_choices_to={"role": "ADMIN"},
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING,
    )

    correction_message = models.TextField(
        blank=True,
        null=True,
    )

    rejection_reason = models.TextField(
        blank=True,
        null=True,
    )

    admin_notes = models.TextField(
        blank=True,
        null=True,
    )

    submitted_at = models.DateTimeField(
        auto_now_add=True
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.client.username} - {self.status}"


class ProfileChange(models.Model):

    class Status(models.TextChoices):
        PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CORRECTION_REQUIRED = "CORRECTION_REQUIRED", "Correction Required"

    registration = models.ForeignKey(
        "registrations.Registration",
        on_delete=models.CASCADE,
        related_name="profile_changes"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile_changes"
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING_REVIEW
    )

    # List of changed fields: [{"field_name": "full_name", "verbose_name": "Full Name", "old_value": "A", "new_value": "B"}]
    changed_fields = models.JSONField(
        default=list,
        blank=True
    )

    # Dict of all pending new field values: {"full_name": "B", ...}
    pending_data = models.JSONField(
        default=dict,
        blank=True
    )

    pending_profile_photo = models.ImageField(
        upload_to="profiles/pending_changes/", blank=True, null=True
    )
    pending_identity_document = models.FileField(
        upload_to="documents/pending_changes/", blank=True, null=True
    )
    pending_additional_document = models.FileField(
        upload_to="documents/pending_changes/", blank=True, null=True
    )

    previous_status = models.CharField(
        max_length=30,
        default="PENDING"
    )

    rejection_reason = models.TextField(
        blank=True,
        null=True
    )

    correction_message = models.TextField(
        blank=True,
        null=True
    )

    admin_notes = models.TextField(
        blank=True,
        null=True
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_profile_changes"
    )

    reviewed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Change Request #{self.id} for {self.registration.matrimony_id} ({self.status})"
