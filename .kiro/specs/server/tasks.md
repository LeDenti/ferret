# Server — tasks

Ordered checklist. Each task references the requirement(s) it fulfils.

## 1. Project skeleton — REQ-SRV-01

- [ ] Confirm `package.json` has no `dependencies`; set `"type": "module"`.
- [ ] Create `src/server/index.ts`, `pools.ts`, `http.ts`.

## 2. Registry — REQ-SRV-04, 05

- [ ] `pools.ts`: `Session` type (`pool`, `tick`, `lastSeen`, `events`).
- [ ] `getOrCreate(req)`: parse cookie, return existing or create new
      `InvoicePool` with demo policy (REQ-SRV-10), set `httpOnly`
      `SameSite=Lax` cookie.
- [ ] `evict()`: remove idle > 2 h, then oldest if count > 500.

## 3. Static serving — REQ-SRV-03

- [ ] `http.ts`: serve `/` → `src/web/index.html`, `/app.js`, `/app.css`.
- [ ] Reject any path containing `..` or outside `src/web/` → 404.

## 4. Health and port — REQ-SRV-02

- [ ] `GET /healthz` → 200 `ok`.
- [ ] `index.ts`: `PORT = +(process.env.PORT || 8787)`, listen, log.

## 5. GET /api/state — REQ-SRV-06

- [ ] Return `{ tick, snapshot, journal(last 50), policy, mood_policy }`.
- [ ] `journal` = `pool.journal.slice(-50)`.

## 6. POST /api/event — REQ-SRV-07, 11

- [ ] Parse JSON body; on failure → 400 `{ error: "invalid json" }`.
- [ ] Validate `op` ∈ six ops; else 400.
- [ ] Validate `args`: integers 0..10⁹, strings ≤ 32 chars `[A-Za-z0-9 _-]`.
- [ ] Call `pool.apply(op, tick, args)`; return `{ decision, snapshot, entry }`.
- [ ] Catch RangeError → 500; never crash.

## 7. POST /api/tick — REQ-SRV-08

- [ ] Parse `{ days }`; if not integer 1..365 → 400.
- [ ] `tick += days`; return `{ tick }`.

## 8. POST /api/reset — REQ-SRV-09

- [ ] Replace pool with fresh `InvoicePool(demo)`; reset `tick = 0`.
- [ ] Return `{ tick: 0, snapshot }`.

## 9. Rate limit — REQ-SRV-12

- [ ] On each event, push `Date.now()` to `session.events`; drop entries older
      than 60 s; if `events.length > 120` → 429.

## 10. Security sweep — REQ-SRV-13

- [ ] No `eval` or `Function(` in any server file.
- [ ] No `fs` reads outside `src/web/` (only index/app.js/app.css).
- [ ] No secrets written to logs; play money only.

## 11. Wire and run — REQ-SRV-01 to 13

- [ ] `index.ts` wires `pools` + `http` into `http.createServer`.
- [ ] Start the server, hit every endpoint with curl:
      `healthz`, `/`, `/app.js`, `/api/state`, `/api/event`, `/api/tick`,
      `/api/reset`, a bad op, a bad arg, a 429 burst.

---

Thin shell done: files, cookies, validation, delegation.
