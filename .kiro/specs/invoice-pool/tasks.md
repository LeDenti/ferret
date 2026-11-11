# Invoice pool — tasks

Ordered checklist. Each task references the requirement(s) it fulfils.

## 1. Shared types — REQ-POOL-01, 02, 11

- [ ] Add `PoolPolicy`, `DEFAULT_POOL_POLICY`, `AdvanceStatus`, `Family`,
      `Refused`, `Snapshot`, `Decision`, `AdvanceRecord` to
      `src/engine/types.ts` (or `invoices.ts` if types.ts does not yet exist).
- [ ] Confirm defaults match REQ-POOL-01; `Family` is the exhaustive union from
      REQ-POOL-06 to 09 plus `unknown_op`.

## 2. Invoice-pool module — REQ-POOL-03 to 10

- [ ] Create `src/engine/invoices.ts` with the `InvoicePool` class importing
      `Mood`, `MoodPolicy`, `DEFAULT_MOOD_POLICY` from `./mood`.
- [ ] Implement `apply`: `mood.pass_time(t)`, dispatch, catch `Refused`, journal,
      apply the mood bump per REQ-POOL-03 (and REQ-MOOD-04 to 08).
- [ ] `_deposit` — REQ-POOL-04 (refuse `zero_amount`; raise lenders, capital,
      deposits).
- [ ] `_withdraw` — REQ-POOL-05 (refuse `not_a_lender`; floor share; refuse
      `pool_illiquid`; else remove, subtract, return `paid`).
- [ ] `_advance` running the twelve checks of REQ-POOL-06 **in order**, with
      `effective()` for scaled ceilings: `duplicate_invoice`,
      `analysis_required`, `zero_amount`, `below_minimum`, `advance_above_face`,
      `fee_above_face`, `due_passed`, `term_too_long`, `advance_above_cap`,
      `concentration_breached`, `debtor_cap_breached`, `pool_illiquid`.
- [ ] On all-pass: add `advance` to `outstanding`, set `exposures`, record
      `funded` with `repaid = 0` (REQ-POOL-06).
- [ ] `_repay` — REQ-POOL-07 (refuse `unknown_invoice`/`not_funded`/
      `zero_amount`; partial or closing with surplus).
- [ ] `_default` — REQ-POOL-08 (refuse `unknown_invoice`/`not_funded`/
      `default_too_early`; `loss`, `fee_got`; update book).
- [ ] `_buyback` — REQ-POOL-09 (refuse `unknown_invoice`/`not_defaulted`;
      `unpaid`, `loss`; update book).
- [ ] `_release` — REQ-POOL-10 (subtract `owed`, delete key at 0).
- [ ] `snapshot()` — REQ-POOL-11 (sorted keys, `{status, repaid}` projection,
      `stress_bps`, `mood`, `effective`).
- [ ] Add the overflow guard before each `× BPS` multiply (design "Integer
      arithmetic").

## 3. Unit tests — REQ-POOL-04 to 09, 12

- [ ] `tests/engine.test.ts`: one test per refusal family — `zero_amount`,
      `not_a_lender`, `pool_illiquid`, `duplicate_invoice`,
      `analysis_required`, `below_minimum`, `advance_above_face`,
      `fee_above_face`, `due_passed`, `term_too_long`, `advance_above_cap`,
      `concentration_breached`, `debtor_cap_breached`, `unknown_invoice`,
      `not_funded`, `default_too_early`, `not_defaulted`, `unknown_op`.
- [ ] Assert each refusal is a no-op (REQ-POOL-12); accepted ops move the book
      exactly as specified.

## 4. Differential replay — design "Differential replay"

- [ ] `tests/cases.test.ts`: load `reference/cases.json`.
- [ ] For every scenario: empty `InvoicePool` with the scenario's `pool_policy`
      and `mood_policy`.
- [ ] After every step compare `decision`, `family` (when refused), and the full
      `after` snapshot (deep-equal, integer equality).
- [ ] Ignore the informative flag `mood_decisive`.
- [ ] On first mismatch report scenario id and step index, then fail.

## 5. Property tests — design "Correctness properties"

- [ ] `tests/properties.test.ts`: random event sequences.
  - Refusal is a no-op (prop 1, REQ-POOL-12).
  - `capital − outstanding ≥ 0` (prop 2, REQ-POOL-13).
  - `losses`/`fees_earned` move only on default, buyback, closing repay (prop 2).
  - Exposures equal sum of `owed` over funded advances per debtor (prop 3,
    REQ-POOL-14).
  - No zero entries in `exposures` (prop 4).
  - Mood monotone ignoring decay (prop 5).

## 6. Run the replay and fix

- [ ] Run the replay and fix until zero mismatches; never edit `reference/`.

---
Tasks 1–5 build the engine and tests; task 6 proves it agrees with the oracle.
