# Invoice pool — requirements

## What this burrow is

Ferret burrow 1 is an invoice-advance pool: a book of play money that advances
cash on an invoice and is repaid (or not). Every request passes the same ordered
checks and gets a yes or a no with a stable family code. The mood (see
`.kiro/specs/mood/`) scales two ceilings — `share_bps` and `max_term` — so a wary
ferret lends less; it never changes the list of checks, their order, or the
family of a refusal. The rules below are the contract with the Python oracle in
`reference/python/ferret/`; integer arithmetic on both sides, so equal means
equal. Amounts are integers (pool's smallest unit). Time is an integer tick (a
day in the demo), never decreasing within a scenario. A scenario starts from
an empty pool. A refusal is always a no-op on the book.

---

## REQ-POOL-01 — PoolPolicy fields and defaults

WHEN the system is initialised THE SYSTEM SHALL accept a `PoolPolicy` with:
`max_share_bps` 3000 (of the capital, the new advance and its fee included),
`max_debtor_abs` 0 (absolute cap per debtor, 0 = none), `max_advance_bps` 9000
(advance ≤ this share of the face), `max_term` 90 (due at most this many ticks
away), `grace` 7 (default only after due + grace), `min_face` 1,
`require_analysis` true. Acceptance: no-argument construction yields the
defaults; from JSON it reproduces every field; no field is `undefined`.

## REQ-POOL-02 — the pool state

WHEN the system starts THE SYSTEM SHALL hold an empty state: `capital` 0,
`deposits` 0, `outstanding` 0, `losses` 0, `fees_earned` 0, `lenders` empty
(lender → deposit), `exposures` empty (debtor → owed, no zero entries),
`advances` empty (invoice id → record), and a `journal` list. Acceptance: the
snapshot before any event has all totals at 0 and empty maps.

## REQ-POOL-03 — single entry point apply(op, t, args)

WHEN an event arrives THE SYSTEM SHALL first call `mood.pass_time(t)`
(REQ-MOOD-02), then dispatch `op` to its handler. IF `op` is not one of
`deposit`, `withdraw`, `advance`, `repay`, `default`, `buyback` THE SYSTEM SHALL
refuse with family `unknown_op`. THE SYSTEM SHALL journal every event with its
decision, family (if refused), and the mood after. THE SYSTEM SHALL react with
mood bumps exactly as in REQ-MOOD-04 to 08 (ceiling refusal →
`+stress_refusal_bps`; accepted default → `+stress_default_bps`; closing repay
→ `−calm_repaid_bps`; accepted buyback → `−calm_buyback_bps`; else → no bump).
Acceptance: unknown op refused `unknown_op`; the mood reacts to the decision;
the journal records every event.

## REQ-POOL-04 — deposit

WHEN `deposit(lender, amount)` is requested THE SYSTEM SHALL refuse with family
`zero_amount` if `amount ≤ 0`. Otherwise THE SYSTEM SHALL add `amount` to
`lenders[lender]`, `capital`, and `deposits`. Acceptance: a positive deposit
raises all three by `amount`; zero or negative is refused and changes nothing.

## REQ-POOL-05 — withdraw (share floored, only from cash not out)

WHEN `withdraw(lender)` is requested THE SYSTEM SHALL refuse with family
`not_a_lender` if `lender` is unknown. THE SYSTEM SHALL compute
`share = floor(deposit × capital ÷ deposits)` (integer division). IF
`share > capital − outstanding` THE SYSTEM SHALL refuse with family
`pool_illiquid`. Otherwise THE SYSTEM SHALL remove the lender, subtract
`deposit` from `deposits`, subtract `share` from `capital`, return `paid = share`.
Acceptance: share is floored; refused withdraw changes nothing; accepted one
returns `paid = share` and updates `deposits` and `capital`.

## REQ-POOL-06 — advance checks in order

WHEN `advance(invoice, supplier, debtor, face, advance, fee, due, analysis)` is
requested THE SYSTEM SHALL, with `eff.share_bps = mood.scale(max_share_bps)` and
`eff.max_term = mood.scale(max_term)` (REQ-MOOD-09), run these checks IN THIS
EXACT ORDER and refuse with the first family that matches:

1. invoice already in `advances` → `duplicate_invoice`
2. `require_analysis` and not `analysis` → `analysis_required`
3. `face ≤ 0` or `advance ≤ 0` → `zero_amount`
4. `face < min_face` → `below_minimum`
5. `advance > face` → `advance_above_face`
6. `fee < 0` or `fee > face − advance` → `fee_above_face`
7. `due ≤ t` → `due_passed`
8. `due > t + eff.max_term` → `term_too_long`
9. `advance × 10000 > face × max_advance_bps` → `advance_above_cap`
10. `(already + owed) × 10000 > capital × eff.share_bps` → `concentration_breached`
    (`already = exposures[debtor] or 0`, `owed = advance + fee`)
11. `max_debtor_abs ≠ 0` and `already + owed > max_debtor_abs` → `debtor_cap_breached`
12. `advance > capital − outstanding` → `pool_illiquid`

If all pass THE SYSTEM SHALL add `advance` to `outstanding`, set
`exposures[debtor] = already + owed`, and record the advance `funded` with
`repaid = 0`.

Acceptance: the engine refuses for the same family as the oracle on the same
input; the order above is part of the contract.

## REQ-POOL-07 — repay (partial vs closing, surplus to supplier)

WHEN `repay(invoice, amount, payer)` is requested THE SYSTEM SHALL refuse with
`unknown_invoice` if absent, `not_funded` if status ≠ `funded`, `zero_amount`
if `amount ≤ 0`. THE SYSTEM SHALL add `amount` to `repaid`. IF `repaid < owed`
THE SYSTEM SHALL do nothing else (partial). IF `repaid ≥ owed` THE SYSTEM SHALL
subtract `advance` from `outstanding`, add `fee` to `capital` and
`fees_earned`, release the exposure by `owed`, set status `repaid`, return
surplus `repaid − owed` to the supplier.

Acceptance: partial repay changes only `repaid`; a closing repay returns
`to_pool = owed`, `to_supplier = repaid − owed`, and updates the book.

## REQ-POOL-08 — default (due + grace, loss, fee_got, book changes)

WHEN `default(invoice)` is requested THE SYSTEM SHALL refuse with
`unknown_invoice` if absent, `not_funded` if status ≠ `funded`,
`default_too_early` if `t < due + grace`. Otherwise THE SYSTEM SHALL compute
`loss = advance − min(repaid, advance)`, `fee_got = max(0, repaid − advance)`,
add `fee_got − loss` to `capital`, `fee_got` to `fees_earned`, `loss` to
`losses`, subtract `advance` from `outstanding`, release the exposure by `owed`,
set status `defaulted`.

Acceptance: the book changes match the oracle exactly; `fee_got ≥ 0`.

## REQ-POOL-09 — buyback

WHEN `buyback(invoice, payer)` is requested THE SYSTEM SHALL refuse with
`unknown_invoice` if absent and `not_defaulted` if status ≠ `defaulted`.
Otherwise THE SYSTEM SHALL set `unpaid = owed − repaid`,
`loss = advance − min(repaid, advance)`, add `unpaid` to `capital`, subtract
`loss` from `losses`, add `unpaid − loss` to `fees_earned`, set `repaid = owed`,
set status `bought_back`.

Acceptance: after buyback `repaid = owed`, status `bought_back`; `losses` falls
by the loss booked at default.

## REQ-POOL-10 — exposure release

WHEN an advance is closed THE SYSTEM SHALL subtract `owed` from
`exposures[debtor]` and remove the key when the remainder reaches 0, so
`exposures` never holds a zero entry.

Acceptance: no zero entries remain in `exposures` after any operation.

## REQ-POOL-11 — snapshot shape (sorted keys)

WHEN the system reports a snapshot THE SYSTEM SHALL return `capital`,
`deposits`, `outstanding`, `losses`, `fees_earned`, `lenders` (sorted keys),
`exposures` (sorted keys, no zeros), `advances` (sorted keys, each
`{status, repaid}`, status ∈ `funded | repaid | defaulted | bought_back`),
`stress_bps`, `mood` (label), and `effective` (`{share_bps, max_term}`).

Acceptance: the JSON string equals the oracle's for the same state; sorted keys
make byte comparison stable.

## REQ-POOL-12 — refusal is a no-op on the book

WHEN any operation is refused THE SYSTEM SHALL leave `capital`, `deposits`,
`outstanding`, `losses`, `fees_earned`, `lenders`, `exposures`, and `advances`
unchanged (the mood may move, per REQ-MOOD-04, but the book does not).

Acceptance: before and after a refusal, the book fields are identical.

## REQ-POOL-13 — money conservation

WHEN any accepted operation runs THE SYSTEM SHALL keep `capital − outstanding ≥
0` and `losses`/`fees_earned` move only on default, buyback, and a closing
repayment.

Acceptance: on random event sequences `capital − outstanding` is never
negative; `losses`/`fees_earned` are unchanged by deposits, withdrawals,
advances, and partial repays.

## REQ-POOL-14 — exposures equal sum of owed over funded advances

WHEN the snapshot is taken THE SYSTEM SHALL ensure `exposures[debtor]` equals
the sum of `owed` over every advance with status `funded` whose debtor is that
debtor.

Acceptance: for every snapshot, `sum(owed for funded advances of debtor) =
exposures[debtor]` for each debtor.
