import secrets
import hashlib
from datetime import timedelta

from django.db import models
from django.db import transaction
from django.conf import settings
from django.utils import timezone


class PasswordResetToken(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)

    EXPIRY_MINUTES = 30

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def generate_for_user(cls, user):
        with transaction.atomic():
            locked_user = type(user).objects.select_for_update().get(pk=user.pk)
            cls.objects.filter(user=locked_user, used=False).update(used=True)

            raw_token = secrets.token_urlsafe(48)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            cls.objects.create(user=locked_user, token_hash=token_hash)
        return raw_token  # Return raw token only once — never stored

    @classmethod
    def verify(cls, raw_token, lock=False):
        """
        Returns the PasswordResetToken instance if valid, else None.
        Does NOT mark as used — call .mark_used() after password is set.
        """
        if not isinstance(raw_token, str) or not raw_token:
            return None

        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        tokens = cls.objects.select_related("user")
        if lock:
            tokens = tokens.select_for_update()
        try:
            obj = tokens.get(
                token_hash=token_hash,
                used=False,
            )
        except cls.DoesNotExist:
            return None

        if timezone.now() >= obj.created_at + timedelta(minutes=cls.EXPIRY_MINUTES):
            obj.used = True
            obj.save(update_fields=["used"])
            return None

        return obj

    def mark_used(self):
        self.used = True
        self.save(update_fields=["used"])

    def __str__(self):
        return "PasswordResetToken"
