"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/wsgi/
"""

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
        raise ImproperlyConfigured(
            "Attach a Railway Volume to the backend service so uploaded media "
            "persists across deployments."
        )
    if settings.MEDIA_ROOT != Path(volume_mount_path):
        raise ImproperlyConfigured(
            "Django MEDIA_ROOT must use RAILWAY_VOLUME_MOUNT_PATH on Railway."
        )
