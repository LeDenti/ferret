# The case file: `cases.json`

One ferret, several burrows. This file is the contract between the Python oracle in `python/ferret/`
(the judge, written 11 November 2026 with Claude Code) and the TypeScript engine built in Kiro from the
specs in `.kiro/specs/`. The engine must reproduce **every** expectation: decision, refusal family and the
snapshot after each event. Integer arithmetic only on both sides, so "equal" means equal.

Regenerate: `python3 generate_cases.py` (same seed → same bytes). Check the oracle against its own file:
`python3 replay_cases.py`.

## Shape

```
{ "format": "ferret-cases/1", "seed": 20261111, "families": [...],
  "scenarios": [ { "id": "demo-0001",
                   "pool_policy": {...}, "mood_policy": {...},
                   "steps": [ { "i": 0, "t": 0, "op": "deposit", "args": {...}, "label": "hint for humans",
                                "expect": { "decision": "ok" } | { "decision": "refuse", "family": "...", "mood_decisive": true? },
                                "after": { snapshot } }, ... ] }, ... ],
  "summary": {...} }
```

A scenario starts from an empty pool. Steps are applied in order, each with its time `t` (integer ticks,
a day in the demo; never decreasing). `label` and `summary` are not part of the contract.

## Operations and their arguments

| op | args | ok result (informative) |
|---|---|---|
| `deposit` | `lender`, `amount` | capital |
| `withdraw` | `lender` | paid = deposit × capital ÷ deposits (floored) |
| `advance` | `invoice`, `supplier`, `debtor`, `face`, `advance`, `fee`, `due`, `analysis` (bool) | owed = advance + fee |
| `repay` | `invoice`, `amount`, `payer` | closed when repaid ≥ owed |
| `default` | `invoice` | loss, recovered, unpaid |
| `buyback` | `invoice`, `payer` | paid = owed − repaid |
| anything else | | refused `unknown_op` |

## The checks, in this order (the order is part of the contract)

**Before any check**: `mood.pass_time(t)`: stress −= decay × (t − last_t), floored at 0.

**deposit**: amount ≤ 0 → `zero_amount`. Then lenders[lender] += amount, capital += amount, deposits += amount.

**withdraw**: lender unknown → `not_a_lender`; share = deposit × capital ÷ deposits (integer division);
share > capital − outstanding → `pool_illiquid`. Then remove the lender, deposits −= deposit, capital −= share.

**advance**, with `eff.share_bps = scale(max_share_bps)` and `eff.max_term = scale(max_term)` (see Mood):
1. invoice already seen → `duplicate_invoice`
2. `require_analysis` and not analysis → `analysis_required`
3. face ≤ 0 or advance ≤ 0 → `zero_amount`
4. face < min_face → `below_minimum`
5. advance > face → `advance_above_face`
6. fee < 0 or fee > face − advance → `fee_above_face`
7. due ≤ t → `due_passed`
8. due > t + eff.max_term → `term_too_long`
9. advance × 10000 > face × max_advance_bps → `advance_above_cap`
10. (already + owed) × 10000 > capital × eff.share_bps → `concentration_breached` (already = exposures[debtor] or 0, owed = advance + fee)
11. max_debtor_abs ≠ 0 and already + owed > max_debtor_abs → `debtor_cap_breached`
12. advance > capital − outstanding → `pool_illiquid`

Then outstanding += advance, exposures[debtor] = already + owed, the advance is recorded `funded` with repaid 0.

**repay**: invoice unknown → `unknown_invoice`; status ≠ funded → `not_funded`; amount ≤ 0 → `zero_amount`.
Then repaid += amount. If repaid < owed: nothing else (partial). Else: outstanding −= advance, capital += fee,
fees_earned += fee, exposure released by owed, status `repaid`; the surplus repaid − owed goes to the supplier.

**default**: unknown → `unknown_invoice`; status ≠ funded → `not_funded`; t < due + grace → `default_too_early`.
Then loss = advance − min(repaid, advance); fee_got = max(0, repaid − advance); capital += fee_got − loss;
fees_earned += fee_got; losses += loss; outstanding −= advance; exposure released by owed; status `defaulted`.

**buyback**: unknown → `unknown_invoice`; status ≠ defaulted → `not_defaulted`. Then unpaid = owed − repaid;
loss = advance − min(repaid, advance); capital += unpaid; losses −= loss; fees_earned += unpaid − loss;
repaid = owed; status `bought_back`.

Exposure release: exposures[debtor] −= owed; the key disappears at 0.

## Mood (the sentiment layer)

One integer, `stress_bps` in 0..10000. It reacts to **decisions**, never to inputs:

| after | stress |
|---|---|
| an `advance` refused for `advance_above_cap`, `concentration_breached` or `debtor_cap_breached` | += stress_refusal_bps |
| a `default` accepted | += stress_default_bps |
| a `repay` that closes the advance | −= calm_repaid_bps |
| a `buyback` accepted | −= calm_buyback_bps |
| time passing (before every event) | −= decay_bps_per_tick × elapsed |

Always clamped to 0..10000. `scale(v) = v − (v × stress_bps × tighten_bps) ÷ 10000²` with integer floor
division. At stress 0 nothing changes; with tighten_bps 0 the mood never changes anything (control scenarios
`nomood-*`). Label for the screen: `calm` below wary_from_bps, `wary` from there, `feral` from feral_from_bps.

What the mood may change: the two ceilings `share_bps` and `max_term`. What it may never change: the list
of checks, their order, the family of a refusal, the arithmetic of money. This is the transposition of the
XRPLife measurement of 4 November 2026: a modulator changes how much the organism does, not what it does.

Steps flagged `"mood_decisive": true` are refusals the base policy would have accepted: the mood alone
decided. They are the ones to show on screen. The flag is informative: a replayer compares `decision` and `family` only.

## Snapshot (compared after every step)

```
capital, deposits, outstanding, losses, fees_earned,
lenders   { lender: deposit }        sorted keys
exposures { debtor: owed }           sorted keys, no zero entries
advances  { invoice: { status, repaid } }   sorted keys; status ∈ funded | repaid | defaulted | bought_back
stress_bps, mood, effective { share_bps, max_term }
```

## Families

`zero_amount` `below_minimum` `duplicate_invoice` `analysis_required` `advance_above_face` `fee_above_face`
`due_passed` `term_too_long` `advance_above_cap` `concentration_breached` `debtor_cap_breached` `pool_illiquid`
`not_a_lender` `unknown_invoice` `not_funded` `default_too_early` `not_defaulted` `unknown_op`

## Requirements, ready for EARS

The checks above read directly as requirements for the Kiro spec, one line each, for example:

- WHEN an advance request names a debtor whose exposure after the advance and its fee would exceed the
  effective share of the capital THE SYSTEM SHALL refuse it with family `concentration_breached`.
- WHEN an advance is refused for a ceiling THE SYSTEM SHALL raise the stress by `stress_refusal_bps`, and
  WHEN it is refused for any other reason THE SYSTEM SHALL leave the stress unchanged.
- WHILE stress is zero THE SYSTEM SHALL apply the policy's ceilings unchanged.
- WHEN time passes THE SYSTEM SHALL lower the stress by `decay_bps_per_tick` per tick, never below zero.
- WHEN a refusal occurs THE SYSTEM SHALL leave capital, outstanding, exposures and advances unchanged.
- WHEN a lender withdraws THE SYSTEM SHALL pay deposit × capital ÷ deposits, floored, and only from cash not out on advances.

Properties Kiro should derive and test against random inputs, then against this file: money is conserved
(capital − outstanding never negative; losses and fees only move on default, buyback and closing repayments);
exposures equal the sum of owed over funded advances; a refusal is a no-op on the book; the mood is
monotone in the events (more refusals and defaults never lower it, repayments never raise it).
