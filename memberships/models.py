from django.conf import settings
from django.db import models


class ContactCreditBalance(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contact_credit_balance",
    )
    remaining_contacts = models.PositiveIntegerField(default=0)
    total_contacts_purchased = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)


class RazorpayOrder(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="razorpay_membership_orders",
    )
    provider_order_id = models.CharField(max_length=100, unique=True)
    payment_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class ContactUnlock(models.Model):
    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="unlocked_profile_contacts",
    )
    profile = models.ForeignKey(
        "registrations.Registration",
        on_delete=models.CASCADE,
        related_name="contact_unlocks",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["viewer", "profile"],
                name="unique_viewer_profile_contact_unlock",
            ),
        ]
