
import mimetypes
from pathlib import Path

from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse, HttpResponseNotFound, JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve


FRONTEND_DIR = Path(settings.BASE_DIR) / "dist"
FRONTEND_ASSETS_DIR = FRONTEND_DIR / "assets"


def health_check(request):
    return JsonResponse({
        "status": "ok",
        "service": "matrimony-api"
    })


def frontend(request):
    index_file = FRONTEND_DIR / "index.html"

    if not index_file.exists():
        return JsonResponse(
            {
                "status": "error",
                "detail": "React build not found"
            },
            status=503
        )

    return FileResponse(
        index_file.open("rb"),
        content_type="text/html"
    )


def frontend_asset(request, path):
    assets_directory = FRONTEND_ASSETS_DIR.resolve()
    try:
        asset_file = (assets_directory / path).resolve(strict=True)
        asset_file.relative_to(assets_directory)
    except (OSError, ValueError):
        return HttpResponseNotFound(
            "Asset not found",
            content_type="text/plain",
        )

    if not asset_file.is_file():
        return HttpResponseNotFound(
            "Asset not found",
            content_type="text/plain",
        )

    return FileResponse(
        asset_file.open("rb"),
        content_type=mimetypes.guess_type(asset_file.name)[0]
        or "application/octet-stream",
    )


urlpatterns = [
    # Health check
    path("health/", health_check, name="health-check"),

    # Django admin
    path("admin/", admin.site.urls),

    # Registration API
    path("api/registrations/", include("registrations.urls")),

    # Account / Login API
    path("api/accounts/", include("accounts.urls")),

    # Admin Panel API
    path("api/adminpanel/", include("adminpanel.urls")),

    # React Vite assets
    path(
        "assets/<path:path>",
        frontend_asset,
    ),

    # React root files
    re_path(
        r"^(?P<path>favicon\.svg|icons\.svg)$",
        serve,
        {"document_root": FRONTEND_DIR}
    ),

    # React homepage
    path("", frontend, name="frontend"),

    # React Router pages
    re_path(
        r"^(?!api/|admin/|assets/|static/|media/|health/).*",
        frontend
    ),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
else:
    urlpatterns += [
        re_path(
            r"^media/profiles/(?P<path>(?!pending_gallery/|pending_changes/).*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT / "profiles"},
            name="production-profile-media",
        ),
    ]