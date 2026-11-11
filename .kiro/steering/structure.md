# Ferret — structure

## Layout

```
src/
  engine/
    mood.ts        # the sentiment layer: stress, decay, scale, labels
    invoices.ts    # burrow 1: the pool, checks, repayment, default, buyback
    types.ts        # shared types: events, snapshot, policies, decisions
  server/           # minimal HTTP server for the demo (node:http, static + JSON)
  web/             # static HTML/CSS/JS field-log UI, no framework
tests/
  cases.test.ts     # central differential test: replays reference/cases.json
  properties.test.ts # random-event property tests (invariants from CASES.md)
  engine.test.ts    # unit tests for mood and invoice checks
tools/
  .gitkeep          # future MCP server (out of scope now)
.kiro/
  specs/
    mood/
      requirements.md
      design.md
      tasks.md
    invoice-pool/
      requirements.md
      design.md
      tasks.md
    field-log-ui/
      requirements.md
      design.md
      tasks.md
    server/
      requirements.md
      design.md
      tasks.md
  steering/
    product.md
    tech.md
    structure.md
reference/           # independent Python judge — read-only, never modified
```

## Conventions

- One spec per concern: `mood`, `invoice-pool`, `field-log-ui`, `server`. Each holds
  `requirements.md` (EARS), `design.md`, `tasks.md`.
- The engine never imports from `src/server/` or `src/web/`. The server depends on the engine,
  not the reverse. This keeps the engine testable without HTTP.
- `tools/` is reserved for a future MCP server; it stays empty and out of scope.
