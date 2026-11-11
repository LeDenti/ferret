# Invoice pool — design

## Where it lives

All pool code is in `src/engine/invoices.ts`, zero runtime dependencies. The
pool imports `Mood` and `MoodPolicy` from `src/engine/mood.ts`; the engine
never imports from `src/server/` or `src/web/`. Shared types live in
`src/engine/types.ts` (or `invoices.ts` if types.ts does not yet exist).

## Types

```ts
export interface PoolPolicy {
  max_share_bps: number; max_debtor_abs: number; max_advance_bps: number;
  max_term: number; grace: number; min_face: number; require_analysis: boolean;
}
export const DEFAULT_POOL_POLICY: PoolPolicy = {
  max_share_bps: 3000, max_debtor_abs: 0, max_advance_bps: 9000,
  max_term: 90, grace: 7, min_face: 1, require_analysis: true,
};
export type AdvanceStatus = "funded" | "repaid" | "defaulted" | "bought_back";
export type Family =
  | "zero_amount" | "below_minimum" | "duplicate_invoice" | "analysis_required"
  | "advance_above_face" | "fee_above_face" | "due_passed" | "term_too_long"
  | "advance_above_cap" | "concentration_breached" | "debtor_cap_breached"
  | "pool_illiquid" | "not_a_lender" | "unknown_invoice" | "not_funded"
  | "default_too_early" | "not_defaulted" | "unknown_op";

export class Refused extends Error {
  readonly family: Family;
  constructor(family: Family, text: string) { super(text); this.family = family; }
}
export interface Snapshot {
  capital: number; deposits: number; outstanding: number; losses: number;
  fees_earned: number;
  lenders: Record<string, number>; exposures: Record<string, number>;
  advances: Record<string, { status: AdvanceStatus; repaid: number }>;
  stress_bps: number; mood: string;
  effective: { share_bps: number; max_term: number };
}
export type Decision =
  | { decision: "ok"; [k: string]: unknown }
  | { decision: "refuse"; family: Family };
```

`Refused` is thrown by a handler when a check fails; `apply` catches it,
journals, applies the mood bump, and returns the decision. `AdvanceRecord`
(supplier, debtor, face, advance, fee, due, repaid, status, funded_at) is
internal; only `{status, repaid}` is exposed in the snapshot.

## InvoicePool class

```ts
import { Mood, MoodPolicy, DEFAULT_MOOD_POLICY } from "./mood";
const BPS = 10_000;
const MOOD_RAISING: ReadonlySet<Family> = new Set([
  "advance_above_cap", "concentration_breached", "debtor_cap_breached",
]);

export class InvoicePool {
  readonly policy: PoolPolicy; readonly mood: Mood;
  capital = 0; deposits = 0; outstanding = 0; losses = 0; fees_earned = 0;
  lenders: Record<string, number> = {};
  exposures: Record<string, number> = {};
  advances: Record<string, AdvanceRecord> = {};
  journal: object[] = [];

  constructor(policy = DEFAULT_POOL_POLICY, mp: MoodPolicy = DEFAULT_MOOD_POLICY) {
    this.policy = policy; this.mood = new Mood(mp);
  }
  effective() {
    return { share_bps: this.mood.scale(this.policy.max_share_bps),
             max_term: this.mood.scale(this.policy.max_term) };
  }
  apply(op: string, t: number, args: Record<string, unknown>): Decision {
    this.mood.pass_time(t);
    const handler = this._dispatch(op);
    const entry = { t, op, ...args };
    try {
      if (!handler) throw new Refused("unknown_op", `unknown op ${op}`);
      const result = handler(t, args);
      if (op === "default") this.mood.bump(this.mood.p.stress_default_bps);
      else if (op === "repay" && (result as any).closed)
        this.mood.bump(-this.mood.p.calm_repaid_bps);
      else if (op === "buyback") this.mood.bump(-this.mood.p.calm_buyback_bps);
      this.journal.push({ ...entry, decision: "ok", ...result,
        stress_bps: this.mood.stress_bps, mood: this.mood.label });
      return { decision: "ok", ...result };
    } catch (e) {
      const family = (e as Refused).family;
      if (op === "advance" && MOOD_RAISING.has(family))
        this.mood.bump(this.mood.p.stress_refusal_bps);
      this.journal.push({ ...entry, decision: "refuse", family,
        stress_bps: this.mood.stress_bps, mood: this.mood.label });
      return { decision: "refuse", family };
    }
  }
  private _release(debtor: string, owed: number) {
    const left = (this.exposures[debtor] ?? 0) - owed;
    if (left > 0) this.exposures[debtor] = left; else delete this.exposures[debtor];
  }
  // _deposit, _withdraw, _advance, _repay, _default, _buyback: REQ-POOL-04..09
}
```

The handlers implement REQ-POOL-04 to 09 exactly as specified. Each throws
`Refused` with the correct family; `apply` catches and journals. The advance
handler runs the twelve checks of REQ-POOL-06 in order, using
`this.effective()` for the mood-scaled ceilings.

## Integer arithmetic

All money math is integer-only (no floats), matching `tech.md` and the Python
oracle. The products that can overflow `Number` (exact up to 2⁵³ ≈ 9 × 10¹⁵):
check 9 `advance × 10000` vs `face × max_advance_bps`, check 10
`(already + owed) × 10000` vs `capital × eff.share_bps`.

**Safe range and guard.** `amount × 10000` overflows when `amount > ~9 × 10¹¹`.
Before each multiply by `BPS`, check `a * BPS <= Number.MAX_SAFE_INTEGER`; if
not, throw `RangeError("pool arithmetic overflow")`. Play-money amounts are far
below the threshold, so the guard never fires. `Math.floor(a / b)` on
non-negative integers matches Python `//`; all operands are non-negative.

## JSON snapshot with sorted keys

`snapshot()` builds plain objects whose keys are inserted in sorted order.
JavaScript stringifies object keys in insertion order, so inserting sorted keys
produces deterministic JSON matching the Python oracle (`dict(sorted(...))`).
The advances map is projected to `{status, repaid}` only.

```ts
snapshot(): Snapshot {
  const sort = (o: Record<string, number>) =>
    Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  return { capital: this.capital, deposits: this.deposits,
    outstanding: this.outstanding, losses: this.losses,
    fees_earned: this.fees_earned, lenders: sort(this.lenders),
    exposures: sort(this.exposures),
    advances: Object.fromEntries(Object.keys(this.advances).sort()
      .map(k => [k, { status: this.advances[k].status,
                      repaid: this.advances[k].repaid }])),
    stress_bps: this.mood.stress_bps, mood: this.mood.label,
    effective: this.effective() };
}
```

## Correctness properties

Invariants to test with random inputs (property tests) and against
`reference/cases.json` (differential replay):

1. **Refusal is a no-op** (REQ-POOL-12) — before and after a refusal, the book
   fields are identical.
2. **Money conservation** (REQ-POOL-13) — `capital − outstanding ≥ 0` after
   every accepted operation; `losses`/`fees_earned` move only on default,
   buyback, and a closing repayment.
3. **Exposures consistency** (REQ-POOL-14) — `exposures[debtor]` equals the sum
   of `owed` over funded advances of that debtor; no zero entries.
4. **No zero entries** — `exposures` never holds a value of 0 after any
   operation.
5. **Mood monotone** (ignoring decay) — more ceiling refusals and accepted
   defaults never lower stress; closing repays and accepted buybacks never raise
   it.

**Differential replay** — `tests/cases.test.ts` loads `reference/cases.json`,
runs every scenario from an empty `InvoicePool` with the scenario's
`pool_policy` and `mood_policy`, and after every step compares `decision`
(`ok`/`refuse`), `family` (when refused), and the full `after` snapshot
(deep-equal, integer equality). The flag `mood_decisive` is **informative** and
not compared. On the first mismatch the test reports the scenario id and step
index and fails.
