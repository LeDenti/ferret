# Mood — tasks

Ordered checklist. Each task references the requirement(s) it fulfils.

## 1. Shared types — REQ-MOOD-01

- [ ] Add `MoodPolicy`, `DEFAULT_MOOD_POLICY`, `MoodLabel`, and `MoodState` to
      `src/engine/types.ts` (or `src/engine/mood.ts` if types.ts does not yet
      exist).
- [ ] Confirm every field is a `number` and the defaults match the table in
      REQ-MOOD-01.

## 2. Mood module — REQ-MOOD-02, 03, 09, 10, 11

- [ ] Create `src/engine/mood.ts` with the `Mood` class.
- [ ] Implement `pass_time(t)`: decay × elapsed, floor 0, reject backwards
      clocks (REQ-MOOD-02).
- [ ] Implement `bump(delta)`: clamp to 0..10000 (REQ-MOOD-03).
- [ ] Implement `scale(value)`: integer floor division, with the overflow guard
      from design.md (REQ-MOOD-09, REQ-MOOD-11).
- [ ] Implement `label` getter: calm / wary / feral from thresholds
      (REQ-MOOD-10).

## 3. Wire decision-driven bumps — REQ-MOOD-04 to 08

- [ ] In the invoice-pool engine, after each decision, call the right bump:
  - refusal for `advance_above_cap`, `concentration_breached`,
    `debtor_cap_breached` → `bump(+stress_refusal_bps)` (REQ-MOOD-04).
  - accepted `default` → `bump(+stress_default_bps)` (REQ-MOOD-05).
  - `repay` that closes → `bump(−calm_repaid_bps)` (REQ-MOOD-06).
  - accepted `buyback` → `bump(−calm_buyback_bps)` (REQ-MOOD-07).
  - everything else → no bump (REQ-MOOD-08).
- [ ] Verify `pass_time(t)` runs before the decision, not after.

## 4. Unit tests — REQ-MOOD-01 to 11

- [ ] `tests/engine.test.ts`: one test per requirement.
  - defaults (01), pass_time forward and backwards (02), clamp boundaries (03),
    refusal families raise / others don't (04, 08), default raises (05),
    closing repay lowers / partial does not (06, 08), buyback lowers (07),
    scale identity and monotonicity (09, 11), label thresholds (10).

## 5. Property tests — design "Correctness properties"

- [ ] `tests/properties.test.ts`: random `pass_time` + `bump` sequences.
  - stress always in 0..10000 (prop 1).
  - scale monotone non-increasing in stress (prop 2).
  - scale(v) = v when stress 0 or tighten 0 (prop 3, 6).
  - pass_time never raises stress (prop 5).
  - bump idempotent at clamps (prop 6).
  - labels follow thresholds (prop 7).

## 6. Replay hook (later) — REQ-MOOD-01 to 11

- [ ] `tests/cases.test.ts`: replay `reference/cases.json`; after every step
      compare `stress_bps`, `mood`, and `effective` in the snapshot. This is
      added once the invoice-pool engine and the mood are both wired.
