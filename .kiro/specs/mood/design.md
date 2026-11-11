# Mood — design

## Where it lives

All mood code is in `src/engine/mood.ts`, zero runtime dependencies. Shared
types live in `src/engine/types.ts`.

## Types

```ts
export interface MoodPolicy {
  stress_refusal_bps: number;   // default 500
  stress_default_bps: number;   // default 3000
  calm_repaid_bps: number;      // default 1000
  calm_buyback_bps: number;     // default 500
  decay_bps_per_tick: number;   // default 100
  tighten_bps: number;          // default 5000; 0 = mood has no effect
  wary_from_bps: number;        // default 2000
  feral_from_bps: number;       // default 6000
}

export const DEFAULT_MOOD_POLICY: MoodPolicy = {
  stress_refusal_bps: 500, stress_default_bps: 3000,
  calm_repaid_bps: 1000, calm_buyback_bps: 500,
  decay_bps_per_tick: 100, tighten_bps: 5000,
  wary_from_bps: 2000, feral_from_bps: 6000,
};

export type MoodLabel = "calm" | "wary" | "feral";
```

## Mood class

```ts
export class Mood {
  readonly p: MoodPolicy;
  stress_bps = 0;
  last_t: number | null = null;

  constructor(policy: MoodPolicy = DEFAULT_MOOD_POLICY) { this.p = policy; }

  /** REQ-MOOD-02. Called once per event before any check. */
  pass_time(t: number): void {
    if (this.last_t !== null) {
      if (t < this.last_t) throw new Error("clock went backwards");
      this.stress_bps = Math.max(0, this.stress_bps - this.p.decay_bps_per_tick * (t - this.last_t));
    }
    this.last_t = t;
  }

  /** REQ-MOOD-03. Clamp to 0..10000. */
  bump(delta_bps: number): void {
    this.stress_bps = Math.min(10_000, Math.max(0, this.stress_bps + delta_bps));
  }

  /** REQ-MOOD-10. Display only. */
  get label(): MoodLabel {
    if (this.stress_bps >= this.p.feral_from_bps) return "feral";
    if (this.stress_bps >= this.p.wary_from_bps) return "wary";
    return "calm";
  }

  /** REQ-MOOD-09. v − floor(v × stress × tighten ÷ 10000²). */
  scale(value: number): number {
    const BPS = 10_000;
    const product = value * this.stress_bps * this.p.tighten_bps;
    return value - Math.floor(product / (BPS * BPS));
  }
}
```

## Integer arithmetic

All mood math is integer-only (no floats), matching `tech.md` and the Python
oracle.

**Overflow.** `scale` computes `value × stress_bps × tighten_bps`. Worst case
`stress_bps = tighten_bps = 10 000`, product is `value × 10⁸`. JavaScript
`Number` is exact for integers up to `Number.MAX_SAFE_INTEGER` (2⁵³ ≈ 9 ×
10¹⁵); the product overflows when `value > ~9 × 10⁷`.

**Handling — two options, in order of preference:**

1. **Number with a guard** (preferred). Before multiplying, check
   `value * 10_000 * 10_000 <= Number.MAX_SAFE_INTEGER`; if not, throw
   `RangeError("mood scale overflow")`. Ceiling values here (`share_bps` ≤
   10 000, `max_term` ≤ a few thousand) are far below the threshold, so the
   guard never fires in practice.
2. **BigInt fallback** (future burrows with large values). Compute as
   `BigInt(value) * BigInt(stress) * BigInt(tighten)`, floor-divide by
   `10_000n * 10_000n`, convert back to `Number` (safe, result ≤ `value`).

Initial implementation uses option 1: either the product fits and we use
`Number`, or we throw — no silent truncation. Floor division
`Math.floor(a / b)` on non-negative integers matches Python `//`; all operands
are non-negative, so the two engines agree to the unit.

## Effective ceilings

The invoice pool calls `mood.scale(max_share_bps)` and `mood.scale(max_term)`
before the concentration and term checks. The mood never changes which checks
run or their order — only the two numbers fed into them.

## Correctness properties

Invariants to test with random inputs (property tests) and against
`reference/cases.json` (differential replay):

1. **Stress range** — after any `pass_time`/`bump` sequence, `stress_bps` ∈ 0..10000.
2. **Scale monotone in stress** — for fixed `value` and `tighten_bps`, `scale(value)` never increases when `stress_bps` rises.
3. **Scale identity at zero** — `scale(v) = v` when `stress_bps = 0` or `tighten_bps = 0`.
4. **Scale bounded** — `0 ≤ scale(v) ≤ v`.
5. **pass_time never raises stress** — for `t ≥ last_t`, stress after `pass_time(t)` ≤ stress before.
6. **bump idempotent at clamps** — at 0, `bump(-k)` leaves 0; at 10 000, `bump(+k)` leaves 10 000.
7. **Labels follow thresholds** — `calm` below `wary_from_bps`, `wary` from `wary_from_bps` to `feral_from_bps − 1`, `feral` at `feral_from_bps`+.
8. **Mood monotone** — more ceiling-refusals and accepted defaults never lower stress; closing repays and accepted buybacks never raise it (ignoring decay).
9. **No-ops leave stress unchanged** — any decision not in REQ-MOOD-04..07 leaves `stress_bps` unchanged after `pass_time`.
