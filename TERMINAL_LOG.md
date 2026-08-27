# Terminal Log

Chronological log of real commands and their actual output from this
project's setup, the authorization bug/fix verification, the Airtable
export (Part 3c), and the Comments feature (Part 3a). Commands are prefixed
with `$`; everything else is real output, copied as produced.

---

## 1. Setup

Backend dependencies (Python virtualenv), then Django migrations and seed
data, run against a local SQLite database (used only because Docker
Desktop/Postgres wasn't available in the working environment at that point
in the session — the same commands work unchanged against the Postgres
container documented in `docker-compose.yml`/`README.md`):

```
$ python -m venv .venv
$ ./.venv/Scripts/python.exe -m pip install -r requirements.txt
[... pip resolves and installs django, djangorestframework, djangorestframework-simplejwt,
     django-cors-headers, psycopg2-binary, requests, pytest-django, pytest ...]

$ ./.venv/Scripts/python.exe manage.py migrate --settings=taskboard.dev_settings
Operations to perform:
  Apply all migrations: auth, contenttypes, projects, users
Running migrations:
  Applying contenttypes.0001_initial... OK
  Applying contenttypes.0002_remove_content_type_name... OK
  Applying auth.0001_initial... OK
  Applying auth.0002_alter_permission_name_max_length... OK
  Applying auth.0003_alter_user_email_max_length... OK
  Applying auth.0004_alter_user_username_opts... OK
  Applying auth.0005_alter_user_last_login_null... OK
  Applying auth.0006_require_contenttypes_0002... OK
  Applying auth.0007_alter_validators_add_error_messages... OK
  Applying auth.0008_alter_user_username_max_length... OK
  Applying auth.0009_alter_user_last_name_max_length... OK
  Applying auth.0010_alter_group_name_max_length... OK
  Applying auth.0011_update_proxy_permissions... OK
  Applying auth.0012_alter_user_first_name_max_length... OK
  Applying users.0001_initial... OK
  Applying projects.0001_initial... OK
  Applying projects.0002_comment... OK

$ ./.venv/Scripts/python.exe manage.py seed --settings=taskboard.dev_settings
seeding...
seed complete.
login with any of these (password: password123):
  meera@taskboard.dev   — admin on Q3 Launch, Internal Tools
  arjun@taskboard.dev   — admin on Onboarding, member on Q3 Launch
  kavya@example.com     — member on Q3 Launch
  dev@example.com       — viewer on Q3 Launch
  lina@example.com      — member on Onboarding
```

Frontend dependencies:

```
$ npm install
added 244 packages, and audited 245 packages in 26s
...
npm warn allow-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn allow-scripts   esbuild@0.21.5 (postinstall: node install.js)

$ npm approve-scripts esbuild
Approved esbuild:
  added esbuild@0.21.5
```

Later in the session, the full stack was also brought up with Docker
(`docker-compose up --build`), which is the documented/canonical setup path:

```
$ docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
NAMES                            STATUS         PORTS
q-taskboard-db-1                 Up 2 minutes   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
q-taskboard-frontend-1           Up 2 minutes   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
q-taskboard-backend-1            Up 2 minutes   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
q-taskboard-airtable-adapter-1   Up 2 minutes   0.0.0.0:4000->4000/tcp, [::]:4000->4000/tcp
```

---

## 2. Initial test run

Baseline run of the pre-existing suite (28 tests, before the Airtable
export feature was added in this session):

```
$ ./.venv/Scripts/python.exe -m pytest --ds=taskboard.test_settings -q
............................                                             [100%]
28 passed in 26.05s
```

---

## 3. Authorization bug — curl proof

> **Placeholder.** Live reproduction of the pre-fix vulnerable endpoint
> (`PATCH /api/tasks/:id` returning `200` for a non-member/viewer) was not
> captured in this session. Reproducing it live would have required
> checking out the pre-fix commit (`5ae6587`) into the working tree, which
> risked disturbing the already-running application and uncommitted
> Airtable work. The vulnerability is instead evidenced directly from the
> pre-fix source code in `REVIEW.md` (`git show 5ae6587:backend/projects/views.py`),
> which shows `TaskDetailView.patch` performing no membership or role check
> before saving.
>
> `[INSERT ORIGINAL VULNERABLE curl OUTPUT HERE IF YOU HAVE IT FROM YOUR OWN EARLIER TESTING]`

---

## 4. Fix — curl proof

Captured against the running application (Docker stack, `localhost:8000`)
in this session. Task `d08a75c5-4e8d-40a3-9570-3323c2d4ff00` ("Finalize
launch date with marketing") belongs to project `Q3 Launch`.

```
$ TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"dev@example.com","password":"password123"}' | jq -r .token)

$ curl -s -o /tmp/resp1.json -w "HTTP %{http_code}\n" -X PATCH \
    "http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"title":"Hacked by viewer"}'
HTTP 403
{"error":"viewers cannot update tasks"}
```

```
$ TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"lina@example.com","password":"password123"}' | jq -r .token)
# lina@example.com is a member of "Customer Onboarding Revamp" only —
# not a member of "Q3 Launch" at all.

$ curl -s -o /tmp/resp2.json -w "HTTP %{http_code}\n" -X PATCH \
    "http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"title":"Hacked by non-member"}'
HTTP 403
{"error":"forbidden"}
```

```
$ curl -s "http://localhost:8000/api/projects/1de6c88d-d758-4171-ab61-c632d2b9e5a4/tasks" \
    -H "Authorization: Bearer <admin token>" | jq '.tasks[] | select(.id=="d08a75c5-4e8d-40a3-9570-3323c2d4ff00") | .title'
"Finalize launch date with marketing"
# unchanged — both unauthorized PATCH attempts above were rejected before any write.
```

```
$ TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"meera@taskboard.dev","password":"password123"}' | jq -r .token)
# meera is admin on Q3 Launch.

$ curl -s -o /tmp/resp3.json -w "HTTP %{http_code}\n" -X PATCH \
    "http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"title":"Finalize launch date with marketing"}'
HTTP 200
{"task":{"id":"d08a75c5-4e8d-40a3-9570-3323c2d4ff00", ..., "title":"Finalize launch date with marketing", ...}}
```

---

## 5. Part 3c — Airtable export demo

Real end-to-end call against the running app, with real Airtable
credentials configured in the (git-ignored) `.env` for the
`airtable-adapter` service:

```
$ TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"meera@taskboard.dev","password":"password123"}' | jq -r .token)

$ curl -s -w "\nHTTP %{http_code}\n" -X POST \
    http://localhost:8000/api/projects/1de6c88d-d758-4171-ab61-c632d2b9e5a4/export \
    -H "Authorization: Bearer $TOKEN"
{"error":"airtable export failed: Unknown field name: \"TaskBoard Task ID\""}
HTTP 502
```

This confirms the full chain is wired correctly end-to-end: Django's
authorization check passes, the task payload is built and forwarded to the
Node adapter (`airtable-adapter`), the adapter authenticates to the real
Airtable REST API with the configured `AIRTABLE_API_KEY`/`AIRTABLE_BASE_ID`,
and Airtable's own API rejects the write — because the target table does not
yet have a `TaskBoard Task ID` field. This is a genuine response from
Airtable's API, not a mock.

**Remaining step (outside this session):** add these fields to the
configured Airtable table, then re-run the export:
`TaskBoard Task ID` (single line text, used as the upsert key), `Title`,
`Description`, `Status`, `Assignee`, `Project ID`, `Created At`, `Updated At`.

---

## 6. Airtable screenshot / second export (idempotency)

> **Placeholder — not yet available.** No export has succeeded yet (see
> §5), so there is no real Airtable screenshot, share link, or record count
> to include here, and none has been fabricated.
>
> Once the table has the required fields (§5), run the export twice and
> capture:
>
> ```
> $ curl -s -X POST http://localhost:8000/api/projects/1de6c88d-d758-4171-ab61-c632d2b9e5a4/export \
>     -H "Authorization: Bearer $TOKEN"
> # first run — expect {"export":{"total":7,"created":7,"updated":0,"failed":[]}}
>
> $ curl -s -X POST http://localhost:8000/api/projects/1de6c88d-d758-4171-ab61-c632d2b9e5a4/export \
>     -H "Authorization: Bearer $TOKEN"
> # second run — expect {"export":{"total":7,"created":0,"updated":7,"failed":[]}}
> # i.e. the same 7 Airtable rows get updated, not duplicated
> ```
>
> `[INSERT AIRTABLE BASE SCREENSHOT OR SHARE LINK HERE]`
> `[INSERT SECOND-EXPORT curl OUTPUT HERE]`

---

## 7. Part 3a — Comments demo

Real calls against the running app.

```
$ TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"meera@taskboard.dev","password":"password123"}' | jq -r .token)

$ curl -s -w "\nHTTP %{http_code}\n" -X POST \
    "http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00/comments" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"body":"Confirmed with marketing, launch date is locked."}'
{"comment":{"id":"d29477c8-5e60-4102-8408-2d37327d79e8","task_id":"d08a75c5-4e8d-40a3-9570-3323c2d4ff00","body":"Confirmed with marketing, launch date is locked.","created_at":"2026-08-27T00:00:16.441996Z","author":{"id":"532fe0f8-1438-4c4c-918e-1c5bfc42801e","email":"meera@taskboard.dev","name":"Meera Iyer"}}}
HTTP 201

$ curl -s "http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00/comments" \
    -H "Authorization: Bearer $TOKEN"
{"comments":[{"id":"d29477c8-5e60-4102-8408-2d37327d79e8", ..., "body":"Confirmed with marketing, launch date is locked.", ...}]}
```

```
$ TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"dev@example.com","password":"password123"}' | jq -r .token)
# dev@example.com is a viewer on Q3 Launch

$ curl -s -w "\nHTTP %{http_code}\n" -X POST \
    "http://localhost:8000/api/tasks/d08a75c5-4e8d-40a3-9570-3323c2d4ff00/comments" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"body":"nope"}'
{"error":"viewers cannot post comments"}
HTTP 403
```

---

## 8. Final test run

Django (37 tests: 28 pre-existing + 9 new Airtable export authorization/adapter-interaction tests):

```
$ ./.venv/Scripts/python.exe -m pytest --ds=taskboard.test_settings -q
.....................................                                    [100%]
37 passed in 50.17s
```

Node adapter (19 new tests — retry/backoff, pagination, idempotency, partial
failure isolation, ~1000-record batching, server auth/validation):

```
$ npx jest
PASS __tests__/retry.test.js
PASS __tests__/exportService.test.js
PASS __tests__/server.test.js

Test Suites: 3 passed, 3 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        1.793 s, estimated 13 s
```

Frontend (19 tests: 13 pre-existing + 6 new for the export trigger/result display):

```
$ npx vitest run
 ✓ src/tests/schemas.test.ts (6 tests)
 ✓ src/tests/TaskCard.test.tsx (3 tests)
 ✓ src/tests/ExportButton.test.tsx (6 tests)
 ✓ src/tests/CommentList.test.tsx (4 tests)

 Test Files  4 passed (4)
      Tests  19 passed (19)
```
