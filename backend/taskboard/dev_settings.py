"""
Local-only override for running the app without Docker/Postgres (e.g. when
Docker Desktop isn't installed or running). Not used by docker-compose or CI.

Run with: python manage.py runserver --settings=taskboard.dev_settings
"""
from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'dev.sqlite3',
    }
}
