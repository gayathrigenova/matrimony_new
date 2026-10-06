from pathlib import Path

from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse, JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve


FRONTEND_DIR = Path(settings.BASE_DIR) / "dist"


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


urlpatterns = [
    # Health check
    path("health/", health_check, name="health-check"),

    # Django admin
    path("admin/", admin.site.urls),

    # Registration API
    path(
        "api/registrations/",
        include("registrations.urls")
    ),

    # Account / Login API
    path(
        "api/accounts/",
        include("accounts.urls")
    ),

    # Admin Panel API
    path(
        "api/adminpanel/",
        include("adminpanel.urls")
    ),

    # React Vite assets
    path(
        "assets/<path:path>",
        serve,
        {
            "document_root": FRONTEND_DIR / "assets"
        }
    ),

    # React root files
    re_path(
        r"^(?P<path>favicon\.svg|icons\.svg)$",
        serve,
        {
            "document_root": FRONTEND_DIR
        }
    ),

    # React homepage
    path(
        "",
        frontend,
        name="frontend"
    ),

    # React Router pages
    re_path(
        r"^(?!api/|admin/|assets/|static/|media/|health/).*$",
        frontend
    ),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )