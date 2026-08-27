"""
HTTP client for the Node Airtable adapter service.

Airtable credentials and all real Airtable API calls live exclusively in the
Node adapter (airtable-adapter/), which uses the official `airtable` npm
package. Django never holds an Airtable API key and never talks to Airtable
directly — it only forwards the task payload to the adapter over HTTP.
"""
import requests
from django.conf import settings


class AirtableAdapterError(Exception):
    """Raised when the adapter is unreachable or reports a failure."""


def export_project_tasks(tasks):
    """
    Sends `tasks` (a list of plain dicts) to the adapter's /export endpoint
    and returns its summary: {"total", "created", "updated", "failed"}.
    """
    url = f"{settings.AIRTABLE_ADAPTER_URL.rstrip('/')}/export"
    headers = {}
    if settings.AIRTABLE_ADAPTER_SHARED_SECRET:
        headers['x-internal-api-key'] = settings.AIRTABLE_ADAPTER_SHARED_SECRET

    try:
        response = requests.post(
            url,
            json={'tasks': tasks},
            headers=headers,
            timeout=settings.AIRTABLE_ADAPTER_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise AirtableAdapterError(f'could not reach the airtable adapter: {exc}') from exc

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code >= 400:
        if isinstance(data, dict):
            message = ': '.join(filter(None, [data.get('error'), data.get('message')]))
        else:
            message = None
        raise AirtableAdapterError(message or f'airtable adapter returned {response.status_code}')

    return data
