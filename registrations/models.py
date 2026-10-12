from django.db import models
from django.conf import settings


class Registration(models.Model):

    # =========================================================
    # STATUS
    # =========================================================

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        CORRECTION_REQUIRED = "CORRECTION_REQUIRED", "Correction Required"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        PUBLISHED = "PUBLISHED", "Published"

    # =========================================================
    # USER
    # =========================================================

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="registrations"
    )

    # =========================================================
    # MATRIMONY ID
    # =========================================================

    matrimony_id = models.CharField(
        max_length=20,
        unique=True,
        blank=True,
        null=True
    )

    # =========================================================
    # PERSONAL INFORMATION
    # =========================================================

    full_name = models.CharField(
        max_length=150
    )

    gender = models.CharField(
        max_length=20
    )

    date_of_birth = models.DateField()

    religion = models.CharField(
        max_length=100,
        blank=True
    )

    caste = models.CharField(
        max_length=100,
        blank=True
    )

    marital_status = models.CharField(
        max_length=50,
        blank=True
    )

    height = models.CharField(
        max_length=20,
        blank=True
    )

    disability = models.CharField(
        max_length=10,
        default="No"
    )

    # =========================================================
    # LOCATION
    # =========================================================

    address = models.TextField(
        blank=True
    )

    city = models.CharField(
        max_length=100,
        blank=True
    )

    district = models.CharField(
        max_length=100,
        blank=True
    )

    state = models.CharField(
        max_length=100,
        default="Kerala"
    )

    # =========================================================
    # EDUCATION
    # =========================================================

    education_level = models.CharField(
        max_length=100,
        blank=True
    )

    education = models.CharField(
        max_length=200,
        blank=True
    )

    highest_education = models.TextField(
        blank=True
    )

    # =========================================================
    # OCCUPATION
    # =========================================================

    occupation_level = models.CharField(
        max_length=100,
        blank=True
    )

    occupation = models.CharField(
        max_length=200,
        blank=True
    )

    company = models.CharField(
        max_length=200,
        blank=True
    )

    income = models.CharField(
        max_length=100,
        blank=True
    )

    work_location = models.CharField(
        max_length=200,
        blank=True
    )

    working_place = models.CharField(
        max_length=200,
        blank=True
    )

    # =========================================================
    # CONTACT
    # =========================================================

    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        unique=True,
    )

    alternate_phone = models.CharField(
        max_length=20,
        blank=True
    )

    # =========================================================
    # SOURCE
    # =========================================================

    source = models.CharField(
        max_length=100,
        blank=True
    )

    # =========================================================
    # ABOUT
    # =========================================================

    about = models.TextField(
        blank=True
    )

    # =========================================================
    # PROFILE PHOTO
    # =========================================================

    profile_photo = models.ImageField(
        upload_to="profiles/",
        blank=True,
        null=True
    )

    # =========================================================
    # DOCUMENTS
    # =========================================================

    identity_document = models.FileField(
        upload_to="documents/identity/",
        blank=True,
        null=True
    )

    additional_document = models.FileField(
        upload_to="documents/additional/",
        blank=True,
        null=True
    )

    # =========================================================
    # VERIFICATION
    # =========================================================

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING
    )

    correction_reason = models.TextField(
        blank=True
    )

    rejection_reason = models.TextField(
        blank=True
    )

    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_registrations"
    )

    verified_at = models.DateTimeField(
        null=True,
        blank=True
    )

    published_at = models.DateTimeField(
        null=True,
        blank=True
    )

    # =========================================================
    # TIMESTAMPS
    # =========================================================

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    # =========================================================
    # FAMILY DETAILS
    # =========================================================

    father_name = models.CharField(
        max_length=150,
        blank=True
    )

    father_occupation = models.CharField(
        max_length=200,
        blank=True
    )

    mother_name = models.CharField(
        max_length=150,
        blank=True
    )

    mother_occupation = models.CharField(
        max_length=200,
        blank=True
    )

    brothers = models.PositiveIntegerField(
        default=0
    )

    married_brothers = models.PositiveIntegerField(
        default=0
    )

    sisters = models.PositiveIntegerField(
        default=0
    )

    married_sisters = models.PositiveIntegerField(
        default=0
    )

    financial_level = models.CharField(
        max_length=100,
        blank=True
    )

    about_family = models.TextField(
        blank=True
    )

    # =========================================================
    # PERMANENT / NATIVE ADDRESS
    # =========================================================

    place = models.CharField(
        max_length=100,
        blank=True
    )

    house_name = models.CharField(
        max_length=200,
        blank=True
    )

    bus_stop = models.CharField(
        max_length=150,
        blank=True
    )

    post_office = models.CharField(
        max_length=150,
        blank=True
    )

    taluk = models.CharField(
        max_length=100,
        blank=True
    )

    village = models.CharField(
        max_length=100,
        blank=True
    )

    # =========================================================
    # CONTACT DETAILS
    # =========================================================

    contact_name = models.CharField(
        max_length=150,
        blank=True
    )

    relationship = models.CharField(
        max_length=100,
        blank=True
    )

    country_code = models.CharField(
        max_length=10,
        default="+91"
    )

    contact_phone = models.CharField(
        max_length=20,
        blank=True
    )

    extra_phone = models.CharField(
        max_length=20,
        blank=True
    )

    # =========================================================
    # META
    # =========================================================

    class Meta:
        ordering = ["-created_at"]

    # =========================================================
    # SAVE - GENERATE MATRIMONY ID
    # =========================================================

    def save(self, *args, **kwargs):

        if not self.matrimony_id:

            last_registration = (
                Registration.objects
                .filter(matrimony_id__startswith="WN")
                .order_by("-id")
                .first()
            )

            if last_registration and last_registration.matrimony_id:

                try:
                    last_number = int(
                        last_registration.matrimony_id.replace("WN", "")
                    )

                    next_number = last_number + 1

                except ValueError:
                    next_number = 100001

            else:
                next_number = 100001

            self.matrimony_id = f"WN{next_number}"

        super().save(*args, **kwargs)

    # =========================================================
    # STRING
    # =========================================================

    def __str__(self):
        return f"{self.matrimony_id} - {self.full_name}"


# =============================================================
# PROFILE VIEWS
# =============================================================

class ProfileView(models.Model):

    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile_views_made"
    )
    viewed_profile = models.ForeignKey(
    Registration,
    on_delete=models.CASCADE,
    related_name="profile_views_received",
    null=True,
    blank=True
    )

    viewed_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ["-viewed_at"]

    def __str__(self):
        return f"{self.viewer} viewed {self.viewed_profile}"


# =============================================================
# INTEREST
# =============================================================

class Interest(models.Model):

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="interests_sent"
    )

    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="interests_received"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.UniqueConstraint(
                fields=["sender", "receiver"],
                name="unique_interest"
            )
        ]

    def __str__(self):
        return f"{self.sender} -> {self.receiver} ({self.status})"


# =============================================================
# SHORTLIST
# =============================================================

class Shortlist(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shortlisted_profiles"
    )

    profile = models.ForeignKey(
        Registration,
        on_delete=models.CASCADE,
        related_name="shortlisted_by"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.UniqueConstraint(
                fields=["user", "profile"],
                name="unique_shortlist"
            )
        ]

    def __str__(self):
        return f"{self.user} shortlisted {self.profile}"


# =============================================================
# CLIENT PHOTOS (Max 4 photos with admin verification)
# =============================================================

class ClientPhoto(models.Model):

    class Status(models.TextChoices):
        APPROVED = "APPROVED", "Approved"
        PENDING = "PENDING", "Pending Approval"
        REJECTED = "REJECTED", "Rejected"

    registration = models.ForeignKey(
        Registration,
        on_delete=models.CASCADE,
        related_name="photos"
    )

    photo = models.ImageField(
        upload_to="profiles/gallery/",
        blank=True,
        null=True
    )

    pending_photo = models.ImageField(
        upload_to="profiles/pending_gallery/",
        blank=True,
        null=True
    )

    slot_index = models.PositiveIntegerField(
        default=1
    )

    is_main = models.BooleanField(
        default=False
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.APPROVED
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["slot_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["registration", "slot_index"],
                name="unique_registration_slot"
            )
        ]

    def __str__(self):
        return f"{self.registration.matrimony_id} - Photo Slot {self.slot_index} ({self.status})"


# =============================================================
# CONVERSATION & MESSAGING
# =============================================================

class Conversation(models.Model):

    participant1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations_p1"
    )

    participant2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations_p2"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["participant1", "participant2"],
                name="unique_conversation_participants"
            )
        ]

    def __str__(self):
        return f"Conversation between {self.participant1} and {self.participant2}"


class Message(models.Model):

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages"
    )

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages"
    )

    content = models.TextField()

    is_read = models.BooleanField(
        default=False
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message from {self.sender} at {self.created_at}"