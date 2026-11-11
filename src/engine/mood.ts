// The sentiment layer: stress in basis points, moved by decisions and time.
// Transposed from the XRPLife measurement (4 Nov 2026): a modulator changes
// HOW MUCH the organism does, not WHAT it does.
//
// All mood math is integer-only (no floats), matching tech.md and the Python oracle.

import { DEFAULT_MOOD_POLICY, type MoodPolicy, type MoodLabel } from "./types.ts";

const BPS = 10_000;

export class Mood {
  readonly p: MoodPolicy;
  stress_bps = 0;
  last_t: number | null = null;

  constructor(policy: MoodPolicy = DEFAULT_MOOD_POLICY) {
    this.p = policy;
  }

  /** REQ-MOOD-02. Called once per event before any check.
   *  Stress fades by decay × elapsed ticks, floored at 0. Time never goes back. */
  pass_time(t: number): void {
    if (this.last_t !== null) {
      if (t < this.last_t) throw new Error("clock went backwards");
      this.stress_bps = Math.max(0, this.stress_bps - this.p.decay_bps_per_tick * (t - this.last_t));
    }
    this.last_t = t;
  }

  /** REQ-MOOD-03. Clamp to 0..10000. */
  bump(delta_bps: number): void {
    this.stress_bps = Math.min(BPS, Math.max(0, this.stress_bps + delta_bps));
  }

  /** REQ-MOOD-10. Display only. */
  get label(): MoodLabel {
    if (this.stress_bps >= this.p.feral_from_bps) return "feral";
    if (this.stress_bps >= this.p.wary_from_bps) return "wary";
    return "calm";
  }

  /** REQ-MOOD-09. v − floor(v × stress × tighten ÷ 10000²), integer floor division only.
   *  At stress 0 or tighten 0 the value is unchanged.
   *  Overflow guard: worst case is value × BPS × BPS (stress and tighten both at max).
   *  Throws RangeError if value is too large for exact integer multiplication. */
  scale(value: number): number {
    // Guard: if value × BPS × BPS would exceed MAX_SAFE_INTEGER, the product
    // could lose precision. Ceiling values here (share_bps ≤ 10000, max_term
    // ≤ a few thousand) are far below the threshold, so this never fires in
    // practice.
    if (value > Math.floor(Number.MAX_SAFE_INTEGER / (BPS * BPS))) {
      throw new RangeError("mood scale overflow");
    }
    const product = value * this.stress_bps * this.p.tighten_bps;
    return value - Math.floor(product / (BPS * BPS));
  }
}
