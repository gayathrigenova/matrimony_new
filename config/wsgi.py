"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/wsgi/
"""

import logging
import os
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()

if os.getenv("RAILWAY_ENVIRONMENT"):
    volume_mount_path = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    if not volume_mount_path:
        logging.getLogger(__name__).critical(
            "RAILWAY_VOLUME_MOUNT_PATH is not set. Django is using %s as "
            "MEDIA_ROOT so the service can start, but that directory is not "
            "persistent without an attached Railway Volume. Attach a volume "
            "at /app/media before enabling media uploads. Media writes are "
            "rejected until Railway provides the mount path.",
            settings.MEDIA_ROOT,
        )
    elif settings.MEDIA_ROOT != Path(volume_mount_path):
        raise ImproperlyConfigured(
            "Django MEDIA_ROOT must use RAILWAY_VOLUME_MOUNT_PATH on Railway."
        )
