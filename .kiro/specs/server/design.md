# Server — design

## Module layout

```
src/server/
  index.ts   entry: reads PORT, creates the registry, starts listening
  pools.ts   registry: create / get / evict pools, one per cookie id
  http.ts    routing: parse request, validate, call pool or serve static
```

The server depends on `src/engine/` (InvoicePool, types). It never imports
`src/web/` as code — only serves its files. No rule logic lives here.

## Data held per visitor

A `Session` in the registry:

```ts
interface Session {
  pool: InvoicePool;   // the engine (REQ-SRV-10)
  tick: number;        // visitor's clock, starts at 0
  lastSeen: number;    // Date.now(), for idle eviction (REQ-SRV-05)
  events: number[];    // timestamps in the last 60 s (REQ-SRV-12)
}
```

The registry is a `Map<string, Session>` plus a creation-order list for
oldest-first eviction. Ids are 24-byte random hex strings.

## Endpoint map

| Method | Path | Action |
|--------|------|--------|
| GET | `/` | serve `src/web/index.html` |
| GET | `/app.js`, `/app.css` | serve the static file |
| GET | `/healthz` | 200 `ok` (no pool needed) |
| GET | `/api/state` | state JSON for the visitor's pool |
| POST | `/api/event` | apply event, return decision + snapshot + entry |
| POST | `/api/tick` | advance tick 1..365, return `{ tick }` |
| POST | `/api/reset` | recreate pool with demo policy, return `{ tick, snapshot }` |

## JSON shapes

```jsonc
// GET /api/state → 200
{ "tick": 0,
  "snapshot": { /* pool.snapshot() */ },
  "journal": [ /* last 50 entries, oldest first */ ],
  "policy": { /* PoolPolicy */ },
  "mood_policy": { /* MoodPolicy */ } }

// POST /api/event ←
{ "op": "advance",
  "args": { "invoice": "INV1", "face": 1000, /* ... */ } }

// POST /api/event → 200
{ "decision": { "decision": "ok", "advanced": 900 },
  "snapshot": { /* pool.snapshot() */ },
  "entry":   { /* last journal entry */ } }

// POST /api/tick ←
{ "days": 7 }

// POST /api/tick → 200 / 400
{ "tick": 7 }

// POST /api/reset → 200
{ "tick": 0, "snapshot": { /* empty */ } }

// Error → 400 / 429 / 500
{ "error": "reason string" }
```

## How the engine is wired

The server never implements a rule. Every POST to `/api/event`:

1. Resolve the visitor's `Session` from the cookie (create if missing).
2. Record `Date.now()` on the session's event log for rate-limiting.
3. Validate `op` and `args` (REQ-SRV-11). On failure return 400.
4. Call `session.pool.apply(op, session.tick, args)`.
5. Return `{ decision, snapshot: pool.snapshot(), entry: journal[last] }`.

`pool.apply` runs `mood.pass_time`, dispatches, journals, and bumps the mood.
The server does not touch the mood or the book — only `apply` and `snapshot`.

## Tick model

The tick is the visitor's clock, starting at 0. `/api/tick` adds `days`
(1..365); `/api/event` always applies at the current tick. The tick never
decreases; `mood.pass_time` rejects backwards clocks, and the server never
lowers it. The visitor can think "next day" (+1), "+7", or "+30".

## Error mapping

| Source | Status | Body |
|--------|--------|------|
| Malformed JSON | 400 | `{ error: "invalid json" }` |
| Unknown op / bad arg | 400 | `{ error: "<reason>" }` |
| Tick days out of range | 400 | `{ error: "days must be 1..365" }` |
| Rate limit exceeded | 429 | `{ error: "rate limit" }` |
| Static / route missing | 404 | `{ error: "not found" }` |
| Engine RangeError | 500 | `{ error: "internal error" }` |

The server catches every handler error; no request crashes the process.

## Correctness properties

1. **A refused event never changes the snapshot** — `pool.apply` leaves the
   book untouched on refusal (REQ-POOL-12); the server returns the same
   snapshot before and after.
2. **Two visitors never share a pool** — each cookie id maps to its own
   `Session`; a deposit by A does not appear in B's snapshot.
3. **The tick never decreases** — `/api/tick` only adds; the server never
   subtracts; `mood.pass_time` rejects backwards clocks.
4. **Reset yields the empty snapshot** — after `/api/reset` every total is 0
   and every map is empty (REQ-POOL-02, REQ-SRV-09).

## Eviction sweep

On every request the registry lazily sweeps: remove pools idle > 2 h, then if
the count still exceeds 500 remove the oldest. One pass, before creation.

---

The server is a thin shell around the engine: files, cookies, validation, and
delegation — nothing more.
