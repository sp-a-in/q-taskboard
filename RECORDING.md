# Screen Recordings

Two recordings cover this submission.

## Recording 1 — Authorization vulnerability, fix, and Comments (Part 3a)

https://www.loom.com/share/e6efab495e664c17a4733035dfc6ebbe

Covers:
- The `PATCH /api/tasks/:id` authorization vulnerability (see `REVIEW.md`
  for the full write-up): no membership/role check before updating a task.
- Reproduction of the vulnerability and the fix (`d775833`, "fix: enforce
  task update authorization").
- The regression tests added for it (`test_non_member_cannot_patch_task`,
  `test_viewer_cannot_patch_task`, `test_member_can_patch_task` in
  `backend/projects/tests.py`) and the backend suite passing.
- The Comments feature (Part 3a): posting/reading comments, and role
  enforcement (viewers can read but not post).

## Recording 2 — Airtable export (Part 3c)

https://www.loom.com/share/7fbdca21701d452d9edf95345ebc54f0

Covers:
- The Airtable export architecture: Django (`POST /api/projects/:id/export`)
  reuses the existing membership authorization helpers and forwards the task
  payload to a separate Node adapter service (`airtable-adapter/`), which is
  the only place holding Airtable credentials and the only code using the
  official `airtable` npm package.
- The adapter's upsert-by-UUID logic, pagination when finding existing
  records, batching in groups of at most 10, and bounded exponential
  backoff with jitter for transient errors (permanent errors are not
  retried, and one bad record doesn't block the rest of a batch).
- The Node/Jest tests (idempotency, retries, partial failures, ~1000
  records) and Django tests (authorization, adapter interaction via
  `backend/projects/airtable_mock.py`) passing.
- A real export against a live Airtable base, and a second export showing
  the same records get updated rather than duplicated.

---

Per `TERMINAL_LOG.md` §5–6: at the time these docs were written, the real
export had reached Airtable successfully (Django → adapter → Airtable API)
but returned a real Airtable-side error because the configured table was
missing the `TaskBoard Task ID` field. If Recording 2 was captured after
that field was added, it should show a successful first export and a
second, idempotent export — update `TERMINAL_LOG.md` §5–6 with the real
output/screenshot from that recording rather than leaving the placeholders
in place.
