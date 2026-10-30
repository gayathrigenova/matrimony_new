import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


# =========================================================
# SECURITY
# =========================================================

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-local-development-only"
)

DEBUG = os.getenv("DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [
    host.strip() for host in os.getenv(
        "DJANGO_ALLOWED_HOSTS",
        "matrimonynew-production.up.railway.app,localhost,127.0.0.1",
    ).split(",") if host.strip()
]


# =========================================================
# APPLICATIONS
# =========================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "corsheaders",

    "accounts",
    "registrations",
    "profiles",
    "memberships",
    "enquiries",
    "adminpanel",
    "notifications",
]


# =========================================================
# MIDDLEWARE
# =========================================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",

    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"


# =========================================================
# TEMPLATES
# =========================================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# =========================================================
# DATABASE
# =========================================================

DB_HOST = os.getenv("DB_HOST") or os.getenv("MYSQLHOST")

if DB_HOST:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.getenv(
                "DB_NAME",
                os.getenv("MYSQLDATABASE", "matrimony_db")
            ),
            "USER": os.getenv(
                "DB_USER",
                os.getenv("MYSQLUSER", "root")
            ),
            "PASSWORD": os.getenv(
                "DB_PASSWORD",
                os.getenv("MYSQLPASSWORD", "")
            ),
            "HOST": DB_HOST,
            "PORT": os.getenv(
                "DB_PORT",
                os.getenv("MYSQLPORT", "3306")
            ),
        }
    }

elif os.getenv("RAILWAY_ENVIRONMENT"):
    raise RuntimeError(
        "Set MYSQLHOST and the Railway MySQL credentials for deployment."
    )

else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# =========================================================
# CUSTOM USER
# =========================================================

AUTH_USER_MODEL = "accounts.User"


# =========================================================
# PASSWORD VALIDATION
# =========================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        ),
    },
]


# =========================================================
# INTERNATIONALIZATION
# =========================================================

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# =========================================================
# STATIC
# =========================================================

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

try:
    import whitenoise  # noqa: F401
except ImportError:
    STATICFILES_BACKEND = (
        "django.contrib.staticfiles.storage.StaticFilesStorage"
    )
else:
    STATICFILES_BACKEND = (
        "whitenoise.storage.CompressedManifestStaticFilesStorage"
    )

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage"
    },
    "staticfiles": {
        "BACKEND": STATICFILES_BACKEND
    },
}


# =========================================================
# MEDIA
# =========================================================

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(
    os.getenv("MEDIA_ROOT")
    or os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    or BASE_DIR / "media"
)


# =========================================================
# DRF
# =========================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}


# =========================================================
# CORS
# =========================================================

CORS_ALLOWED_ORIGINS = [
    origin.strip().rstrip("/") for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,https://matrimony-sepia-phi.vercel.app",
    ).split(",") if origin.strip()
]
if "http://localhost:5174" not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append("http://localhost:5174")

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]


# =========================================================
# CSRF
# =========================================================

CSRF_TRUSTED_ORIGINS = [
    origin.strip().rstrip("/") for origin in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://matrimony-sepia-phi.vercel.app,https://matrimonynew-production.up.railway.app",
    ).split(",") if origin.strip()
]

# =========================================================
# RAILWAY HTTPS
# =========================================================

SECURE_PROXY_SSL_HEADER = (
    "HTTP_X_FORWARDED_PROTO",
    "https",
)

IS_RAILWAY = bool(os.getenv("RAILWAY_ENVIRONMENT"))

if IS_RAILWAY:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


# =========================================================
# EMAIL
# =========================================================

EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv(
    "EMAIL_USE_TLS",
    "false" if EMAIL_PORT == 465 else "true",
).lower() == "true"
EMAIL_USE_SSL = os.getenv(
    "EMAIL_USE_SSL",
    "true" if EMAIL_PORT == 465 else "false",
).lower() == "true"
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ImproperlyConfigured(
        "EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled."
    )
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "webmaster@localhost")
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST or os.getenv("RAILWAY_ENVIRONMENT")
    else "django.core.mail.backends.console.EmailBackend"
)

OTP_EXPIRY_SECONDS = int(os.getenv("OTP_EXPIRY_SECONDS", "600"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", "60"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
if min(OTP_EXPIRY_SECONDS, OTP_RESEND_COOLDOWN_SECONDS, OTP_MAX_ATTEMPTS) <= 0:
    raise ImproperlyConfigured(
        "OTP expiry, resend cooldown, and attempt limit must be positive integers."
    )

SMS_PROVIDER = os.getenv("SMS_PROVIDER", "twilio")
SMS_DEFAULT_COUNTRY_CODE = os.getenv("SMS_DEFAULT_COUNTRY_CODE", "+91")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
TWILIO_MESSAGING_SERVICE_SID = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
