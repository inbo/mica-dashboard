# Django 3.2 supports Python up to 3.10
FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=mica.settings_docker

RUN apt-get update \
    && apt-get install -y --no-install-recommends binutils libproj-dev gdal-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code
COPY requirements.txt /code/
RUN pip install -r requirements.txt
COPY . /code

# Django 3.2 needs a SECRET_KEY to import django.contrib.auth
RUN SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput

RUN useradd --system --uid 1000 --no-create-home app
USER app

EXPOSE 8000
CMD ["gunicorn", "mica.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-"]
