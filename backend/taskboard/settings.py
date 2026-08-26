from pathlib import Path
from datetime import timedelta
import os

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-secret-change-me-in-production')
DEBUG = os.environ.get('DEBUG', 'true').lower() == 'true'
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'corsheaders',
    'users',
    'projects',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'taskboard.urls'
WSGI_APPLICATION = 'taskboard.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'taskboard'),
        'USER': os.environ.get('POSTGRES_USER', 'taskboard'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'taskboard'),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }
}

AUTH_USER_MODEL = 'users.User'
APPEND_SLASH = False

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=30),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

CORS_ALLOW_ALL_ORIGINS = True

# The Node adapter service owns Airtable credentials and makes the real
# Airtable API calls (via the official `airtable` npm package). Django only
# forwards the task payload to it over HTTP — see projects/airtable_client.py.
AIRTABLE_ADAPTER_URL = os.environ.get('AIRTABLE_ADAPTER_URL', 'http://airtable-adapter:4000')
AIRTABLE_ADAPTER_SHARED_SECRET = os.environ.get('AIRTABLE_ADAPTER_SHARED_SECRET', '')
AIRTABLE_ADAPTER_TIMEOUT = float(os.environ.get('AIRTABLE_ADAPTER_TIMEOUT', '30'))

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_TZ = True
