import os

from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import FileSystemStorage


class PersistentMediaStorage(FileSystemStorage):
    """Reject Railway uploads until persistent media storage is available."""

    def _save(self, name, content):
        if os.getenv("RAILWAY_ENVIRONMENT") and not os.getenv(
            "RAILWAY_VOLUME_MOUNT_PATH"
        ):
            raise ImproperlyConfigured(
                "Media uploads are temporarily unavailable because the Railway "
                "Volume is not attached. Attach it at /app/media and redeploy."
            )
        return super()._save(name, content)
