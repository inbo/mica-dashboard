# Deployment: copy this file to settings_local.py and customize

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ["0.0.0.0"]

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = "USE SOMETHING SECURE HERE!"

# Database
# https://docs.djangoproject.com/en/3.1/ref/settings/#databases
DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": "postgis",
        "USER": "postgis",
        "PASSWORD": "postgis",
        "HOST": "db",
        "PORT": 5432,
    }
}

ALLOWED_HOSTS = ["localhost"]

GBIF_USERNAME = ""
GBIF_PASSWORD = ""
