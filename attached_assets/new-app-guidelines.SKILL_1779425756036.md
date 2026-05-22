---
name: new-app-guidelines
description: Use this skill when starting a brand-new project, scaffolding an initial codebase, designing the first schema, defining the first routes, or making foundational architecture decisions in a young codebase with little existing code. Establishes non-negotiable defaults for file size and layering (route → service → repository → UI), small functions, schema-first development with migration discipline, database-level uniqueness and transactions, webhook and retry idempotency, separating authentication from authorization, rate-limiting sensitive endpoints, handler ordering, never trusting the client for money or identity, consistent error shape, observability with request IDs and structured events, persistent state, background-job retries, N+1 prevention, UTC timestamps, soft deletes with audit_log, tests for money and auth paths, dependency control, environment hygiene, feature flags, and asking clarifying questions before coding. Trigger phrases include "new project", "starting a new app", "greenfield", "scaffold this", "set up the project", "initial schema", "design the data model", "first routes", or any context where the assistant is making early structural decisions that will shape the rest of the codebase.
---

# New App Guidelines

> Read this before writing any code in a new project. These rules are
> non-negotiable defaults. If a normal approach would conflict, follow
> this skill instead and tell the user what is being done differently.
> Reference rules by section number when drift appears.

---

## When this skill applies

- A new project, fresh repo, or major greenfield build.
- The user is scaffolding initial files, designing the first schema, or defining first routes.
- The codebase is small enough that patterns set now will scale across the whole app.
- For work in an established codebase with users and data, use `existing-app-guidelines` instead.

---

## 1. Keep files small from day one

- Backend route files: ≤ ~500 lines. Split by domain into `server/routes/<domain>.ts`.
- Frontend page files: ≤ ~400 lines. Extract sections into `components/<page>/` child components.
- Service/repository files: ≤ ~600 lines.
- At the limit, new work goes in a new file — refuse to keep growing oversized files.

---

## 2. Enforce strict layering

- **Routes/controllers** — auth, validation, orchestration only.
- **Services** — business logic only. No HTTP req/res objects.
- **Repositories/storage** — database access only. No business rules.
- **UI components** — presentation and local UI state only.

Never put SQL in routes. Never put req/res inside services. Never put business rules in UI components. Never duplicate business logic across layers.

---

## 3. Keep functions small and predictable

- Functions ≤ ~50 lines unless strongly justified.
- Max ~3 levels of nesting.
- One function, one responsibility.
- Prefer early returns over nested conditionals.

If a function needs long comments to explain it, it is doing too much.

---

## 4. Schema-first with migration discipline

- First action on any new feature: propose changes to `shared/schema.ts` AND generate a migration. Wait for confirmation before writing routes or UI.
- Use end-to-end types derived from the schema (e.g., Drizzle insert/select types).
- If a value may vary by tenant, user, org, or environment, model it as data — never hardcode.
- Every schema change generates a new migration file. **Never edit a committed migration** — write a new one that alters or adds.
- Destructive migrations (`DROP COLUMN`, `DROP TABLE`, non-reversible `ALTER`) require explicit user confirmation, even in dev.

---

## 5. Protect correctness with the database

- Every "this must be unique" rule gets a UNIQUE index. Examples: payment intent IDs, webhook event IDs, per-tenant emails or usernames, phone (if used as login), natural keys from external systems.
- Every multi-row write that must succeed-or-fail-together goes in a `db.transaction()`.
- On Postgres `23505` (unique violation), refetch the existing row and return idempotent success — do not 500 on a race.
- Never rely on "check first, then insert" alone.

---

## 6. Design webhooks and retries for idempotency

- Every webhook handler must be idempotent.
- Use a `webhook_events` table keyed by the provider's event ID. Record processed IDs.
- Duplicate deliveries no-op and return 200.
- Any "send" action that could be called twice is either naturally safe or explicitly guarded by a "has this been sent?" check.

---

## 7. Authentication and authorization are separate

- Authentication answers "who are you?" Authorization answers "can you touch *this specific* resource?"
- Every sensitive endpoint must check both.
- The server verifies resource ownership independently. Never trust ownership info from the request body.
- Sensitive operations (password reset, identity changes) derive the target identity from the authenticated session, not the body.
- Sensitive tokens (password reset, magic link) are single-use, atomically claimed on first use.

---

## 8. Rate-limit sensitive endpoints from day one

- Every endpoint that triggers an email/SMS or generates a token (login links, reset tokens, signup, OTPs) has a rate limit per IP AND per target identity.
- Rate-limit state persists across restarts (DB or Redis). In-memory limiters reset on every restart and are a security hole.
- Responses must not enumerate: "if that email exists, we sent a link" — not "too many attempts for user X."

---

## 9. Handler ordering: auth → validate → authz → work

Every handler follows this order:

1. Authenticate
2. Validate input
3. Check authorization / resource ownership
4. Run business logic
5. Commit side effects

A failed auth check should never have touched the database. No side effects until all three checks pass. Reject early and cheaply.

---

## 10. Do not trust the client for money, identity, or ownership

- Server calculates prices and totals. Client sends "I want N of item X"; server looks up X's price.
- Server derives identity from the authenticated session, not a body field saying "I'm user 7".
- Server independently verifies ownership of any resource ID.
- Validate every request body with a strict Zod schema (`.strict()` — reject unknown fields).
- Never spread `req.body` into a database insert. Name every field explicitly.

---

## 11. Standardize error handling

- One error response shape app-wide. Use a helper; every handler and middleware returns it.

  ```json
  { "success": false, "error": { "code": "SOME_CODE", "message": "Human-readable message" } }
  ```

- Stack traces never reach the client. Log them server-side with the request ID (§12); return a safe message.
- Map errors to specific HTTP codes: validation → 400, auth → 401, authz → 403, not found → 404, conflict/unique violation → 409, rate limit → 429, everything else → 500. Do not return 500 for validation errors.
- Stable error codes (strings like `VALIDATION_FAILED`, `UNIQUE_VIOLATION`) so the frontend branches on code, not message.

---

## 12. Observability: request IDs, structured events, zero PII

- Every request gets a unique request ID at the edge, threaded through every log line. Return as `x-request-id` response header.
- Default request logging: `METHOD PATH STATUS DURATION REQUEST_ID`. Nothing else.
- Never capture request or response bodies. No `res.json` monkey-patching, ever.
- PII never in logs: no emails, phones, full names, addresses, payment IDs, reset tokens, magic-link tokens, session IDs, or SMS content.
- Emit structured business events at key milestones: `signup_completed`, `payment_success`, `payment_failed`, `login_failed`, `webhook_duplicate_ignored`.
- Wire up error tracking (Sentry or similar) with PII scrubbing before send. Include the request ID so user-reported issues correlate to errors.
- Targeted debug logs go inside specific handlers and are removed when done.

---

## 13. State that must survive restarts belongs in durable storage

- Anything affecting security, billing, correctness, rate limits, token usage, or single-use guarantees persists in DB/Redis.
- In-memory state is fine only for harmless cache misses or local UI behavior.
- Never use in-memory `Map`s for correctness decisions.

---

## 14. Background work: make failures loud, retries explicit

- If a side effect (email, SMS, webhook POST, external HTTP) can fail transiently, either retry with backoff from a job table, or fail loudly to the caller. Never silently swallow.
- Queue-style work persists in the database. A `jobs` table with `status`, `attempts`, `last_error`, `next_attempt_at` beats "try and pray".
- Emails and SMS that matter (confirmations, receipts, reset links) are not fire-and-forget. Log the attempt to a `message_log` table before sending, mark sent after.
- Outbound failures log at ERROR with the request ID.

---

## 15. Extract repeated logic early

- 5+ duplicated lines in two places = a smell.
- By the third occurrence, extract.
- Cross-cutting concerns (auth checks, activity logging, notifications, rate limiting) live in helpers, not inline in every handler.
- Multi-table storage operations are one repository method, not a sequence of calls in the route.

---

## 16. Query hygiene and performance from day one

- Never query the database inside a loop over app-level data. Rewrite as one query with a join or `IN`.
- Fetch once per endpoint, not once per field.
- Select only required columns.
- Pagination is mandatory for any list endpoint that can grow past a few hundred rows.
- Index every column used in a filter or sort on a hot-path query. Ship the index in the same migration as the feature.
- Do not call external APIs before auth and validation pass.

---

## 17. Dates and times: store UTC, convert at the edges

- Every timestamp column is `timestamptz` storing UTC. Never naked `timestamp`. Never strings.
- Business logic operates in UTC.
- Conversion to local time happens only at the presentation edge: UI, email templates, CSV exports.
- Duration fields are integers with unit in the name (`duration_seconds`, `ttl_minutes`).
- Client-provided dates are parsed against a known, explicitly-passed timezone.
- Never call `new Date()` assuming the server's local zone.

---

## 18. Soft deletes and audit trail for sensitive changes

- Financial, identity, and audit-relevant rows are soft-deleted with a `deleted_at` timestamp. Queries filter `deleted_at IS NULL` by default.
- An `audit_log` table records every change to money, identity, or permission: who, when, what table/row, from-value, to-value, request ID.
- Hard delete only for ephemeral data (rate-limit counters, expired sessions, old log events).
- Never cascade-delete across a financial or identity boundary without explicit user review.

---

## 19. Tests where they matter, from day one

- Set up a test runner on day one.
- For every endpoint that handles money, auth, or permissions: at least one happy-path test and one failure-path test.
- Use a real test database (test schema, not mocks) for anything SQL-related. Mocks lie about constraints, transactions, and races.
- Tests run on every change.

---

## 20. Control dependencies tightly

- Do not add a package without explaining why the existing stack cannot do it.
- Prefer the existing stack first.
- Avoid multiple libraries for the same responsibility.
- Every dependency is a liability — keep the surface small.

---

## 21. Environment and deploy discipline

- All environment-specific behavior (URLs, API keys, senders, modes) reads from environment variables. Never hardcoded.
- Never commit secrets. Use Replit Secrets.
- Test email and SMS templates with production-style data before release — wrong base URLs in magic links are a classic "works in dev, broken in prod" bug.
- Have a one-shot, read-only way to inspect production data for diagnosis.

---

## 22. Feature flags for risky functionality

- New risky features (payments, auth changes, messaging, core workflows) ship behind a feature flag (env var or DB toggle) when practical.
- The flag lets the user disable the feature without a redeploy.
- Separate cleanup from behavior changes — do not bundle them.
- Remove the flag once the feature is proven.

---

## 23. Ask before building: clarifying questions and definition of done

- If a request is ambiguous about schema, auth, or money, ask before coding. Not after.
- If proceeding without asking, list every assumption made and wait for confirmation.
- "Done" means the unhappy paths were tested — not that the happy path compiled. At minimum: auth-failure, authz-failure, validation-failure, and idempotency tests where external IDs apply.
- Before declaring done, summarize what was built AND what was deliberately NOT built.

---

## 24. Communicate trade-offs, not just answers

- State the risk before non-trivial work: "low risk" or "touches the live payments path — here is what could go wrong."
- Distinguish "fixes a bug you have today" from "fixes a bug you might have tomorrow."
- Recommend deferral when appropriate. Not every good idea ships today.

---

## 25. Keep conventions visible every session

- Maintain a `replit.md` that loads every session and points to this skill.
- Update it whenever a non-obvious design rule is introduced.
- Add banner comments to files at risk of growing oversized, restating the no-grow rule at the source.
- Reference sections by number when spotting drift ("violating §9 — auth check must come before the DB lookup").

---

## Definition of done

A task is not done until:

- Ambiguities were clarified before coding (§23)
- Schema changes were proposed first and confirmed (§4)
- File size, layering, and function-size rules were followed (§1–3)
- Correct DB constraints, indexes, and migration exist (§4–5)
- Auth AND resource-ownership checks are in place (§7)
- Rate limits protect sensitive endpoints (§8)
- Multi-write operations use transactions (§5)
- External events are idempotent (§6)
- Client is not trusted for money, identity, or ownership (§10)
- Errors use the standard shape with stable codes (§11)
- Request IDs thread through logs; no PII logged; structured events emitted (§12)
- Outbound side effects are tracked, not silently swallowed (§14)
- Timestamps are UTC `timestamptz` (§17)
- Money/identity tables soft-delete and write to `audit_log` (§18)
- Happy-path + unhappy-path tests are in place (§19)
- Dependencies are justified (§20)
- Risk and deferred concerns were stated clearly (§24)

---

## Quick checklist when adding a feature

1. Clarify ambiguities (§23)
2. Schema + migration first; wait for confirmation (§4)
3. UNIQUE constraints + hot-path indexes in same migration (§5, §16)
4. Choose correct route → service → repository file locations (§2)
5. Handler order: auth → validate → authz → work (§9)
6. Money and identity calculated server-side; strict Zod on body (§10)
7. Transactions on multi-write operations (§5)
8. Idempotent external-ID inserts (§6)
9. Rate limit unauthenticated trigger endpoints (§8)
10. Consistent error shape + stable error code (§11)
11. Request ID on every log line; no PII; no bodies (§12)
12. Queue/log any outbound side effect that matters (§14)
13. No queries inside loops; paginate list endpoints (§16)
14. Timestamps stored as UTC `timestamptz` (§17)
15. Soft-delete money/identity rows; write to `audit_log` (§18)
16. Extract logic duplicated 3+ times (§15)
17. Happy-path + unhappy-path tests (§19)
18. Justify any new dependency (§20)
19. Update `replit.md` if new rule introduced (§25)
20. Risk + what-was-NOT-built summary before declaring done (§23, §24)

---

## Never do

- Add a new route to a big monolith file
- Mix routing, business logic, and DB access in one place
- Write functions over ~50 lines or nest beyond ~3 levels
- Start coding an ambiguous request without asking
- Trust client-supplied prices, identities, or ownership
- Spread `req.body` into a database insert
- Skip transactions on multi-write operations
- Insert a row with a natural unique key without a UNIQUE index
- Edit a committed migration file (write a new one instead)
- Run a destructive schema change without explicit confirmation
- Log request bodies, response bodies, or PII
- Silently swallow errors from outbound calls
- Query the database inside a loop over app-level data
- Use in-memory state for security or correctness decisions
- Hard-delete financial or identity data
- Store timestamps as naked `timestamp` without timezone
- Return a raw stack trace to the client
- Write the same logic for the third time without extracting a helper
- Add a dependency without justifying it
- Ship a feature without a request ID on every log line
- Mark a task done without testing the unhappy paths
