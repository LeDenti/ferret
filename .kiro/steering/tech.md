# Ferret — tech

## Language and runtime

- TypeScript, strict mode, targeting Node 20+ (ESM).
- Integer arithmetic only for money and mood. No floats anywhere in money or mood math. Basis points
  (bps) are integers; scale factors are computed with integer floor division. This matches the Python
  oracle, so the two engines agree to the unit.

## Dependencies

- The engine (`src/engine/`) has zero runtime dependencies. Standard library only.
- The demo server (`src/server/`) may use Node's built-in `node:http` and `node:fs` — nothing else.
- The web UI (`src/web/`) is static HTML/CSS/JS served by the server; no build step, no framework.

## Tests

- Built-in Node test runner (`node --test`).
- The central test replays `reference/cases.json` exactly as `reference/CASES.md` describes: for every
  step it compares the decision, the refusal family, and the full snapshot. Integer equality is exact.
- Property tests feed random events to the engine and assert the invariants in `CASES.md` (money
  conserved, exposures equal sum of owed over funded advances, refusals are no-ops, mood monotone).

## Safety and scope

- Play money only. No real currency, no wallets, no external payments, no signing keys.
- Never write a key or a secret to disk or logs.
- Never modify anything under `reference/`. Treat it as read-only: the independent Python judge.
