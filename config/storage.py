import os
import logging

from django.core.files.storage import FileSystemStorage
from rest_framework.exceptions import APIException


logger = logging.getLogger(__name__)


class PersistentMediaUnavailable(APIException):
    status_code = 503
    default_detail = (
        "Media uploads are temporarily unavailable because the Railway Volume "
        "is not attached. Attach it at /app/media and redeploy."
    )
    default_code = "persistent_media_unavailable"


class PersistentMediaStorage(FileSystemStorage):
    """Reject Railway uploads until persistent media storage is available."""

    def _save(self, name, content):
        if os.getenv("RAILWAY_ENVIRONMENT") and not os.getenv(
            "RAILWAY_VOLUME_MOUNT_PATH"
        ):
            logger.error(
                "Rejected media write for %s because Railway did not provide "
                "RAILWAY_VOLUME_MOUNT_PATH.",
                name,
            )
            raise PersistentMediaUnavailable()
        return super()._save(name, content)
