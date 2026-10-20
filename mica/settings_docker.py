import json
import os
import urllib.request

from .settings import *  # noqa: F401,F403

DEBUG = os.environ.get("DEBUG", "False").lower() == "true"

SECRET_KEY = os.environ.get("SECRET_KEY")

ALLOWED_HOSTS = [h for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if h]

# The load balancer health checks use the IP address of the task as Host header
_ecs_metadata_uri = os.environ.get("ECS_CONTAINER_METADATA_URI_V4")
if _ecs_metadata_uri:
    try:
        with urllib.request.urlopen(_ecs_metadata_uri, timeout=2) as response:
            ALLOWED_HOSTS.append(
                json.load(response)["Networks"][0]["IPv4Addresses"][0]
            )
    except (OSError, ValueError, KeyError, IndexError):
        pass

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": os.environ.get("DB_NAME", "mica"),
        "USER": os.environ.get("DB_USER", "mica"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 15768000
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"
MIDDLEWARE = list(MIDDLEWARE)
MIDDLEWARE.insert(
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

MAINTENANCE_MODE_STATE_FILE_PATH = os.environ.get(
    "MAINTENANCE_MODE_STATE_FILE_PATH", "/tmp/maintenance_mode_state.txt"
)

GBIF_USERNAME = os.environ.get("GBIF_USERNAME", "")
GBIF_PASSWORD = os.environ.get("GBIF_PASSWORD", "")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {
        "handlers": ["console"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
}
