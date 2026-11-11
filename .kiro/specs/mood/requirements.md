# Mood — requirements

## What the mood is

Ferret has a mood: one integer, `stress_bps`, in basis points on the range
0..10000. Stress is moved by **decisions** (a debtor pushes past a ceiling, an
advance defaults, an advance is repaid or bought back) and by **time** (it fades
every tick). The mood never touches the list of checks, their order, the family
of a refusal, or the arithmetic of money. It only scales two ceilings —
`share_bps` and `max_term` — so that a wary ferret lends less, and a feral ferret
less still. With `tighten_bps = 0` the mood changes nothing at all.

This is the transposition of the XRPLife measurement (4 November 2026): a
modulator changes how much the organism does, not what it does.

---

## REQ-MOOD-01 — MoodPolicy fields and defaults

WHEN the system is initialised THE SYSTEM SHALL accept a `MoodPolicy` with these
integer fields and defaults: `stress_refusal_bps` 500, `stress_default_bps`
3000, `calm_repaid_bps` 1000, `calm_buyback_bps` 500, `decay_bps_per_tick` 100,
`tighten_bps` 5000 (at full stress a ceiling shrinks by this share; 5000 =
halved), `wary_from_bps` 2000, `feral_from_bps` 6000.

Acceptance: a policy with no arguments yields the defaults; constructed from
JSON it reproduces every field; no field is `undefined` after construction.

## REQ-MOOD-02 — pass_time (decay × elapsed, floor 0, clock never backwards)

WHEN an event arrives at time `t` THE SYSTEM SHALL, before any other processing,
lower the stress by `decay_bps_per_tick × (t − last_t)`, floored at 0, where
`last_t` is the time of the previous event (or `null` on the first event). IF
`t < last_t` THEN THE SYSTEM SHALL raise an error and leave the stress and
`last_t` untouched.

Acceptance: first event changes nothing and sets `last_t`; later events
decrease by exactly `decay × elapsed`, never below 0; `pass_time` never raises
stress.

## REQ-MOOD-03 — bump (clamp 0..10000)

WHEN the system applies a stress delta THE SYSTEM SHALL set
`stress_bps = clamp(stress_bps + delta, 0, 10000)`.

Acceptance: positive delta past 10000 sets 10000; negative past 0 sets 0; delta
0 is a no-op; repeated calls past a clamp are idempotent.

## REQ-MOOD-04 — refusal for a ceiling raises stress

WHEN an `advance` is refused with family `advance_above_cap`,
`concentration_breached`, or `debtor_cap_breached` THE SYSTEM SHALL raise the
stress by `stress_refusal_bps` (via `bump`).

Acceptance: the three ceiling families increase stress by
`stress_refusal_bps` subject to the clamp; any other family does not.

## REQ-MOOD-05 — default accepted raises stress

WHEN a `default` operation is accepted THE SYSTEM SHALL raise the stress by
`stress_default_bps` (via `bump`).

Acceptance: accepted `default` increases stress by `stress_default_bps` subject
to the clamp.

## REQ-MOOD-06 — closing repayment lowers stress

WHEN a `repay` operation closes an advance (repaid ≥ owed) THE SYSTEM SHALL
lower the stress by `calm_repaid_bps` (via `bump`).

Acceptance: closing `repay` decreases stress by `calm_repaid_bps` subject to the
clamp; a partial `repay` does not change the stress.

## REQ-MOOD-07 — buyback accepted lowers stress

WHEN a `buyback` operation is accepted THE SYSTEM SHALL lower the stress by
`calm_buyback_bps` (via `bump`).

Acceptance: accepted `buyback` decreases stress by `calm_buyback_bps` subject
to the clamp.

## REQ-MOOD-08 — any other decision leaves stress unchanged

WHEN the system processes any decision other than those in REQ-MOOD-04 through
REQ-MOOD-07 — accepted deposits, accepted advances, partial repays,
withdrawals, refusals for non-ceiling families — THE SYSTEM SHALL leave
`stress_bps` unchanged (after `pass_time`).

Acceptance: accepted `deposit`, accepted `advance`, partial `repay`,
`withdraw`, and refusals for non-ceiling families do not change stress.

## REQ-MOOD-09 — scale(v) with integer arithmetic

WHEN the system needs an effective ceiling THE SYSTEM SHALL compute
`scale(v) = v − floor(v × stress_bps × tighten_bps ÷ 10000²)` using integer
floor division only, and use the result in place of the raw ceiling.

Acceptance: returns an integer for every integer input; `scale(v) = v` when
`stress_bps = 0`; `scale(v) = v` when `tighten_bps = 0`; monotone non-increasing
in `stress_bps`; `scale(v) ≤ v`; no floating-point intermediates.

## REQ-MOOD-10 — labels calm / wary / feral

WHEN the system reports the mood for the screen THE SYSTEM SHALL return `feral`
if `stress_bps ≥ feral_from_bps`, `wary` if `stress_bps ≥ wary_from_bps`,
otherwise `calm`.

Acceptance: below `wary_from_bps` → `calm`; from `wary_from_bps` up to
`feral_from_bps − 1` → `wary`; at or above `feral_from_bps` → `feral`; the label
never affects a decision or the scale.

## REQ-MOOD-11 — tighten 0 means the mood changes nothing

WHEN `tighten_bps = 0` THE SYSTEM SHALL leave every ceiling unchanged for all
stress values, so that `scale(v) = v` always.

Acceptance: with `tighten_bps = 0`, `scale(v) = v` for every `stress_bps` in
0..10000; the control scenarios `nomood-*` in `cases.json` produce the same
decisions as a mood-less engine.
