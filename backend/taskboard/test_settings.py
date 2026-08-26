"""
Local-only override so the test suite can run against SQLite when no
Postgres server is available (e.g. Docker isn't running). Not used by the
app itself and not referenced by docker-compose or pytest.ini — invoke with
`pytest --ds=taskboard.test_settings` when you need it.
"""
from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}
