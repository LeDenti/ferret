# Server — requirements

## What this is

A minimal HTTP server for the demo. One Node process, `node:http` only, zero
runtime dependencies. It serves the static field-log UI and a small JSON API
that wraps the engine. The server never implements a rule: it validates input,
calls `pool.apply`, and returns the result. One `InvoicePool` per visitor, held
in memory, keyed by an opaque cookie. Play money only.

---

## REQ-SRV-01 — single process, node:http, zero dependencies

WHEN the server starts THE SYSTEM SHALL run a single Node process using only
`node:http` and `node:fs` from the standard library, with no runtime
dependencies. Acceptance: `package.json` lists no `dependencies`; the server
imports nothing outside `node:` and `src/`.

## REQ-SRV-02 — port and health

WHEN the server starts THE SYSTEM SHALL listen on `PORT` from the environment,
defaulting to 8787, and respond to `GET /healthz` with status 200 and body
`ok`. Acceptance: `curl localhost:8787/healthz` returns 200 `ok`.

## REQ-SRV-03 — static files

WHEN the server receives `GET /` THE SYSTEM SHALL serve `src/web/index.html`.
WHEN it receives `GET /app.js` or `GET /app.css` THE SYSTEM SHALL serve the
matching file under `src/web/`. Any other static path returns 404. THE SYSTEM
SHALL NOT read any file outside `src/web/`. Acceptance: the three paths return
200 with the right content type; `/../secret` returns 404.

## REQ-SRV-04 — one pool per visitor, cookie-keyed

WHEN a visitor first arrives (no cookie or unknown id) THE SYSTEM SHALL create
an `InvoicePool` with the demo policy, assign it an opaque random id, and store
that id in a cookie (`httpOnly`, `SameSite=Lax`, path `/`). Subsequent requests
bearing the cookie SHALL address the same pool. Acceptance: two browsers get
different cookies and independent snapshots.

## REQ-SRV-05 — eviction: idle timeout and capacity

WHEN a pool has been idle for 2 hours, or when the registry holds 500 pools,
THE SYSTEM SHALL evict the oldest pool. Acceptance: after 2 h idle a pool is
gone; at 500 pools the oldest is removed before a new one is created.

## REQ-SRV-06 — GET /api/state

WHEN the server receives `GET /api/state` THE SYSTEM SHALL return JSON
`{ tick, snapshot, journal, policy, mood_policy }` where `journal` is the last
50 entries. Acceptance: 200 with the five keys; `snapshot` equals
`pool.snapshot()`.

## REQ-SRV-07 — POST /api/event

WHEN the server receives `POST /api/event` with JSON `{ op, args }` THE SYSTEM
SHALL apply the event at the current tick via `pool.apply(op, tick, args)` and
return `{ decision, snapshot, entry }`. Acceptance: 200 with the decision, the
snapshot, and the journal entry just added.

## REQ-SRV-08 — POST /api/tick

WHEN the server receives `POST /api/tick` with JSON `{ days }` THE SYSTEM SHALL
advance the tick by `days` (1..365) and return `{ tick }`. IF `days` is outside
1..365 THE SYSTEM SHALL return 400 and leave the tick unchanged. Acceptance:
tick increases by `days`; out-of-range returns 400.

## REQ-SRV-09 — POST /api/reset

WHEN the server receives `POST /api/reset` THE SYSTEM SHALL replace the
visitor's pool with a fresh `InvoicePool` using the demo policy, reset the tick
to 0, and return `{ tick, snapshot }`. Acceptance: snapshot after reset has all
totals 0 and empty maps (REQ-POOL-02).

## REQ-SRV-10 — demo policy

WHEN a pool is created for a visitor THE SYSTEM SHALL use
`DEFAULT_POOL_POLICY` and `DEFAULT_MOOD_POLICY`. Acceptance: the pool's
`policy` and `mood.p` equal the defaults from `types.ts`.

## REQ-SRV-11 — input validation

WHEN the server receives a POST with malformed JSON, an `op` not among the six,
or an argument outside its domain (integers in 0..10⁹; strings ≤ 32 chars
matching `[A-Za-z0-9 _-]`; `analysis` a short string or boolean) THE SYSTEM
SHALL return 400 with a reason and never crash. Acceptance: bad input yields
400 and a JSON body `{ error }`; the process stays up.

## REQ-SRV-12 — rate limit

WHEN a visitor exceeds 120 events per minute THE SYSTEM SHALL return 429.
Acceptance: the 121st event in a 60 s window returns 429; the limit resets
after the window.

## REQ-SRV-13 — security and scope

WHEN the server runs THE SYSTEM SHALL use no `eval`, read no file outside
`src/web/`, write no secret to disk or logs, and handle play money only.
Acceptance: no `eval`/`Function` in source; static reads confined to `src/web/`;
no secrets in environment or logs.

---

The server is a thin shell: it serves files, holds pools in memory, validates
input, and delegates every decision to the engine.
