"""
Test double for the Airtable integration.

The real integration talks to Airtable exclusively from the Node adapter
service (airtable-adapter/), via the official `airtable` npm package. Django
never calls Airtable directly — it calls `airtable_client.export_project_tasks`,
which makes one HTTP request to that adapter.

`MockAirtableAdapter` stands in for that HTTP call in Django tests, so
authorization and adapter-interaction behavior (what payload gets built, how
the response is handled, how adapter failures surface to the API) can be
exercised without a network call, a running Node process, or credentials.
It mirrors the adapter's real upsert semantics (matching on the task's UUID)
closely enough to make those tests meaningful.
"""


class MockAirtableAdapter:
    def __init__(self):
        self.calls = []
        self._records_by_task_id = {}
        self.raise_error = None

    def export_project_tasks(self, tasks):
        self.calls.append(tasks)
        if self.raise_error:
            raise self.raise_error

        created = 0
        updated = 0
        for task in tasks:
            task_id = task['id']
            if task_id in self._records_by_task_id:
                updated += 1
            else:
                created += 1
            self._records_by_task_id[task_id] = dict(task)

        return {
            'total': len(tasks),
            'created': created,
            'updated': updated,
            'failed': [],
        }
