# Code Review — Task Update Authorization Vulnerability

## Summary

`PATCH /api/tasks/:id` had no authorization check at all. Any authenticated
user — including a user with no membership on the task's project, or a
viewer explicitly restricted to read-only access — could update the title,
description, status, or assignee of **any task in the system**, as long as
they knew (or guessed/enumerated) its UUID.

## Affected code

- **File:** `backend/projects/views.py`
- **Method:** `TaskDetailView.patch`
- **Fixed in commit:** `d775833` "fix: enforce task update authorization"
- **Vulnerable state:** commit `5ae6587` (`d775833`'s parent) and everything before it

### Vulnerable code (before the fix, `git show 5ae6587:backend/projects/views.py`)

```python
class TaskDetailView(APIView):
    def patch(self, request, task_id):
        try:
            task = Task.objects.get(id=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)

        if 'title' in request.data:
            task.title = request.data['title'].strip()
        if 'description' in request.data:
            task.description = request.data['description'] or None
        if 'status' in request.data:
            new_status = request.data['status']
            if new_status not in ('todo', 'in_progress', 'review', 'done'):
                return Response({'error': 'invalid status'}, status=status.HTTP_400_BAD_REQUEST)
            task.status = new_status
        if 'assigneeId' in request.data:
            task.assignee_id = request.data['assigneeId'] or None
        task.save()

        task_data = TaskSerializer(Task.objects.select_related('assignee').get(id=task_id)).data
        return Response({'task': task_data})
```

The method fetches the task by ID and immediately mutates and saves it.
There is no call to `_get_membership()` and no role check — contrast this
with `TaskDetailView.delete` in the very same class, which already had the
correct pattern (membership lookup, then `_can_edit_tasks(membership.role)`)
at the same point in history. The authorization logic existed in the
codebase; it just wasn't applied to this one endpoint.

### Impact

- **Broken access control (OWASP A01:2021).** Any authenticated user of the
  app — regardless of project membership or role — could modify any task in
  any project, including projects they were never invited to.
- **Privilege escalation for viewers.** The `viewer` role is meant to be
  read-only (this is enforced on create/delete and on comments), but PATCH
  silently ignored that restriction.
- **Data integrity / business impact.** A malicious or compromised account
  could reassign, relabel, or change the status of arbitrary tasks
  (e.g. marking work "done" that wasn't, or reassigning tasks away from
  their owner), with no audit trail distinguishing legitimate edits from
  unauthorized ones.
- Task IDs are UUIDv4 and not secret, but they are also not access-control
  boundaries by themselves — they're returned in plain task listings to any
  member of *a* project, and the vulnerability meant possessing any task ID
  from anywhere was sufficient to edit it.

### The fix

`TaskDetailView.patch` now performs the same two-step authorization check
used everywhere else in this file, before touching the task:

```python
membership = _get_membership(request.user, str(task.project_id))
if not membership:
    return Response({'error': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)
if not _can_edit_tasks(membership.role):
    return Response({'error': 'viewers cannot update tasks'}, status=status.HTTP_403_FORBIDDEN)
```

- `_get_membership(user, project_id)` returns `None` if the user has no
  `Membership` row for the task's project → **403 "forbidden"** for
  non-members.
- `_can_edit_tasks(role)` returns `True` only for `admin`/`member` → **403
  "viewers cannot update tasks"** for viewers.
- Admins and members retain full update access, unchanged.

### Live proof (fixed behavior, captured against the running app this session)

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" -X PATCH \
    http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00 \
    -H "Authorization: Bearer <viewer token, dev@example.com>" \
    -H "Content-Type: application/json" -d '{"title":"Hacked by viewer"}'
HTTP 403   {"error":"viewers cannot update tasks"}

$ curl -s -o /dev/null -w "HTTP %{http_code}\n" -X PATCH \
    http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00 \
    -H "Authorization: Bearer <non-member token, lina@example.com>" \
    -H "Content-Type: application/json" -d '{"title":"Hacked by non-member"}'
HTTP 403   {"error":"forbidden"}

$ curl -s -X PATCH http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00 \
    -H "Authorization: Bearer <admin token, meera@taskboard.dev>" \
    -H "Content-Type: application/json" -d '{"title":"Finalize launch date with marketing"}'
HTTP 200   {"task": {...}}
```

Full exact output is in `TERMINAL_LOG.md` under "Fix curl proof."

> **Note on the vulnerable HTTP 200:** live reproduction of the pre-fix
> endpoint returning `200` was not captured in this session — doing so would
> have required checking out the pre-fix commit into the working tree, which
> risked disturbing the already-running application and uncommitted work.
> The vulnerability above is instead evidenced directly from the pre-fix
> source (`git show 5ae6587:backend/projects/views.py`, reproduced above) and
> from the "before" tests: `backend/projects/tests.py` had no test for
> `PATCH /api/tasks/:id` authorization prior to `d775833`.

### Regression tests

`backend/projects/tests.py`, class `TestTasks` (added in the same fix
commit, still present and passing):

- `test_non_member_cannot_patch_task` — a user with no membership on the
  task's project gets `403`, and the task is unchanged.
- `test_viewer_cannot_patch_task` — a `viewer` gets `403`, and the task is
  unchanged.
- `test_member_can_patch_task` — a `member` (non-admin) can still patch
  successfully, `200`.

These run as part of the full backend suite (37 passed — see
`TERMINAL_LOG.md`, "Final test run").
