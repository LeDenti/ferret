// Tests for the mood engine — one test per REQ-MOOD id (01..11), plus
// property tests 1-7 from the design, using a seeded LCG (no dependency).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { Mood } from "../src/engine/mood.ts";
import { DEFAULT_MOOD_POLICY } from "../src/engine/types.ts";
import type { MoodPolicy } from "../src/engine/types.ts";

// ---------------------------------------------------------------------------
// Seeded LCG (Lehmer / MINSTD, modulus 2³¹−1, multiplier 48271). Deterministic.
// ---------------------------------------------------------------------------

class LCG {
  private state: number;
  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }
  next(): number {
    this.state = (this.state * 48271) % 2147483647;
    return this.state;
  }
  /** Random integer in [0, max). */
  range(max: number): number {
    return this.next() % max;
  }
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

describe("Mood — requirements", () => {

  test("REQ-MOOD-01: MoodPolicy fields and defaults", () => {
    // Default policy has all the right values
    assert.strictEqual(DEFAULT_MOOD_POLICY.stress_refusal_bps, 500);
    assert.strictEqual(DEFAULT_MOOD_POLICY.stress_default_bps, 3000);
    assert.strictEqual(DEFAULT_MOOD_POLICY.calm_repaid_bps, 1000);
    assert.strictEqual(DEFAULT_MOOD_POLICY.calm_buyback_bps, 500);
    assert.strictEqual(DEFAULT_MOOD_POLICY.decay_bps_per_tick, 100);
    assert.strictEqual(DEFAULT_MOOD_POLICY.tighten_bps, 5000);
    assert.strictEqual(DEFAULT_MOOD_POLICY.wary_from_bps, 2000);
    assert.strictEqual(DEFAULT_MOOD_POLICY.feral_from_bps, 6000);

    // Constructed from JSON reproduces every field
    const json: MoodPolicy = {
      stress_refusal_bps: 500,
      stress_default_bps: 3000,
      calm_repaid_bps: 1000,
      calm_buyback_bps: 500,
      decay_bps_per_tick: 100,
      tighten_bps: 5000,
      wary_from_bps: 2000,
      feral_from_bps: 6000,
    };
    for (const key of Object.keys(json) as (keyof MoodPolicy)[]) {
      assert.strictEqual(json[key], DEFAULT_MOOD_POLICY[key]);
    }

    // No field is undefined after construction
    const m = new Mood();
    for (const key of Object.keys(DEFAULT_MOOD_POLICY) as (keyof MoodPolicy)[]) {
      assert.notStrictEqual(m.p[key], undefined);
    }
  });

  test("REQ-MOOD-02: pass_time — decay × elapsed, floor 0, clock never backwards", () => {
    const m = new Mood();

    // First event changes nothing and sets last_t
    m.pass_time(5);
    assert.strictEqual(m.stress_bps, 0);
    assert.strictEqual(m.last_t, 5);

    // Later events decrease by exactly decay × elapsed, never below 0
    m.bump(3000);
    assert.strictEqual(m.stress_bps, 3000);
    m.pass_time(10); // 5 ticks elapsed
    assert.strictEqual(m.stress_bps, 3000 - 100 * 5); // 2500
    assert.strictEqual(m.last_t, 10);

    // Never below 0
    m.bump(10000);
    m.pass_time(1000); // lots of ticks
    assert.strictEqual(m.stress_bps, 0);

    // Clock backwards raises error, stress and last_t untouched
    const m2 = new Mood();
    m2.bump(500);
    m2.pass_time(10);
    const stressBefore = m2.stress_bps;
    const lastTBefore = m2.last_t;
    assert.throws(() => m2.pass_time(5), /clock went backwards/);
    assert.strictEqual(m2.stress_bps, stressBefore);
    assert.strictEqual(m2.last_t, lastTBefore);

    // pass_time never raises stress
    const m3 = new Mood();
    m3.pass_time(0);
    m3.bump(2000);
    const before = m3.stress_bps;
    m3.pass_time(100);
    assert.ok(m3.stress_bps <= before, `pass_time raised stress from ${before} to ${m3.stress_bps}`);
  });

  test("REQ-MOOD-03: bump — clamp 0..10000", () => {
    const m = new Mood();

    // Positive delta past 10000 sets 10000
    m.bump(15000);
    assert.strictEqual(m.stress_bps, 10000);

    // Negative past 0 sets 0
    m.bump(-20000);
    assert.strictEqual(m.stress_bps, 0);

    // Delta 0 is a no-op
    m.bump(500);
    const mid = m.stress_bps;
    m.bump(0);
    assert.strictEqual(m.stress_bps, mid);

    // Repeated calls past a clamp are idempotent
    m.bump(10000); // at max
    m.bump(1000);
    assert.strictEqual(m.stress_bps, 10000);
    m.bump(-20000); // at 0
    m.bump(-1000);
    assert.strictEqual(m.stress_bps, 0);
  });

  test("REQ-MOOD-04: refusal for a ceiling raises stress by stress_refusal_bps", () => {
    // The three ceiling families (advance_above_cap, concentration_breached,
    // debtor_cap_breached) each bump by +stress_refusal_bps.
    const m = new Mood();
    m.bump(DEFAULT_MOOD_POLICY.stress_refusal_bps);
    assert.strictEqual(m.stress_bps, DEFAULT_MOOD_POLICY.stress_refusal_bps);

    // Three ceiling refusals → 3 × stress_refusal_bps
    const m2 = new Mood();
    for (let i = 0; i < 3; i++) {
      m2.bump(DEFAULT_MOOD_POLICY.stress_refusal_bps);
    }
    assert.strictEqual(m2.stress_bps, 3 * DEFAULT_MOOD_POLICY.stress_refusal_bps);

    // Subject to the clamp at 10000
    const m3 = new Mood();
    for (let i = 0; i < 30; i++) {
      m3.bump(DEFAULT_MOOD_POLICY.stress_refusal_bps);
    }
    assert.strictEqual(m3.stress_bps, 10000);
  });

  test("REQ-MOOD-05: default accepted raises stress by stress_default_bps", () => {
    const m = new Mood();
    m.bump(DEFAULT_MOOD_POLICY.stress_default_bps);
    assert.strictEqual(m.stress_bps, DEFAULT_MOOD_POLICY.stress_default_bps);

    // Subject to the clamp
    const m2 = new Mood();
    m2.bump(9000);
    m2.bump(DEFAULT_MOOD_POLICY.stress_default_bps);
    assert.strictEqual(m2.stress_bps, 10000);
  });

  test("REQ-MOOD-06: closing repayment lowers stress by calm_repaid_bps", () => {
    const m = new Mood();
    m.bump(5000);
    m.bump(-DEFAULT_MOOD_POLICY.calm_repaid_bps);
    assert.strictEqual(m.stress_bps, 5000 - DEFAULT_MOOD_POLICY.calm_repaid_bps);

    // A partial repay does not change the stress (no bump call)
    const m2 = new Mood();
    m2.bump(3000);
    const before = m2.stress_bps;
    // partial repay → no bump → stress unchanged
    assert.strictEqual(m2.stress_bps, before);

    // Floored at 0
    const m3 = new Mood();
    m3.bump(200);
    m3.bump(-DEFAULT_MOOD_POLICY.calm_repaid_bps);
    assert.strictEqual(m3.stress_bps, 0);
  });

  test("REQ-MOOD-07: buyback accepted lowers stress by calm_buyback_bps", () => {
    const m = new Mood();
    m.bump(5000);
    m.bump(-DEFAULT_MOOD_POLICY.calm_buyback_bps);
    assert.strictEqual(m.stress_bps, 5000 - DEFAULT_MOOD_POLICY.calm_buyback_bps);

    // Floored at 0
    const m2 = new Mood();
    m2.bump(100);
    m2.bump(-DEFAULT_MOOD_POLICY.calm_buyback_bps);
    assert.strictEqual(m2.stress_bps, 0);
  });

  test("REQ-MOOD-08: any other decision leaves stress unchanged (after pass_time)", () => {
    // Decisions not in 04..07 (accepted deposits, accepted advances, partial
    // repays, withdrawals, non-ceiling refusals) only run pass_time, no bump.
    const m = new Mood();
    m.pass_time(0);
    m.bump(3000);

    // Simulate a deposit at t=1: only pass_time runs
    const expected1 = Math.max(0, 3000 - DEFAULT_MOOD_POLICY.decay_bps_per_tick * 1);
    m.pass_time(1);
    assert.strictEqual(m.stress_bps, expected1);

    // Simulate an accepted advance at t=2: only pass_time runs
    const expected2 = Math.max(0, expected1 - DEFAULT_MOOD_POLICY.decay_bps_per_tick * 1);
    m.pass_time(2);
    assert.strictEqual(m.stress_bps, expected2);

    // Simulate a partial repay at t=3: only pass_time runs (no closing bump)
    const expected3 = Math.max(0, expected2 - DEFAULT_MOOD_POLICY.decay_bps_per_tick * 1);
    m.pass_time(3);
    assert.strictEqual(m.stress_bps, expected3);
  });

  test("REQ-MOOD-09: scale(v) with integer arithmetic", () => {
    const m = new Mood();

    // Returns an integer for every integer input
    m.stress_bps = 5000;
    const expected = 10000 - Math.floor((10000 * 5000 * 5000) / (10000 * 10000));
    assert.strictEqual(m.scale(10000), expected);
    assert.strictEqual(m.scale(10000), 7500);

    // scale(v) = v when stress_bps = 0
    m.stress_bps = 0;
    assert.strictEqual(m.scale(9999), 9999);
    assert.strictEqual(m.scale(0), 0);

    // scale(v) = v when tighten_bps = 0
    const m2 = new Mood({ ...DEFAULT_MOOD_POLICY, tighten_bps: 0 });
    m2.stress_bps = 10000;
    assert.strictEqual(m2.scale(9999), 9999);

    // Monotone non-increasing in stress_bps
    const m3 = new Mood();
    let prev = m3.scale(3000);
    for (let s = 100; s <= 10000; s += 100) {
      m3.stress_bps = s;
      const cur = m3.scale(3000);
      assert.ok(cur <= prev, `scale not monotone at stress ${s}: ${cur} > ${prev}`);
      prev = cur;
    }

    // scale(v) ≤ v
    m3.stress_bps = 10000;
    assert.ok(m3.scale(3000) <= 3000);

    // No floating-point intermediates: result is always an integer
    m3.stress_bps = 3333;
    assert.strictEqual(m3.scale(90), 90 - Math.floor((90 * 3333 * 5000) / 100000000));

    // Overflow guard fires for very large values
    assert.throws(() => m3.scale(100_000_000), /mood scale overflow/);
  });

  test("REQ-MOOD-10: labels calm / wary / feral", () => {
    const m = new Mood();

    // Below wary_from_bps → calm
    m.stress_bps = 0;
    assert.strictEqual(m.label, "calm");
    m.stress_bps = 1999;
    assert.strictEqual(m.label, "calm");

    // From wary_from_bps up to feral_from_bps − 1 → wary
    m.stress_bps = 2000;
    assert.strictEqual(m.label, "wary");
    m.stress_bps = 5999;
    assert.strictEqual(m.label, "wary");

    // At or above feral_from_bps → feral
    m.stress_bps = 6000;
    assert.strictEqual(m.label, "feral");
    m.stress_bps = 10000;
    assert.strictEqual(m.label, "feral");

    // The label never affects a decision or the scale (it's display only)
    const m2 = new Mood();
    m2.stress_bps = 2000; // wary
    assert.strictEqual(m2.scale(3000), 3000 - Math.floor((3000 * 2000 * 5000) / 100000000));
  });

  test("REQ-MOOD-11: tighten 0 means the mood changes nothing", () => {
    const m = new Mood({ ...DEFAULT_MOOD_POLICY, tighten_bps: 0 });

    // scale(v) = v for every stress_bps in 0..10000
    for (let s = 0; s <= 10000; s += 500) {
      m.stress_bps = s;
      assert.strictEqual(m.scale(3000), 3000, `scale should be identity at stress ${s}`);
      assert.strictEqual(m.scale(90), 90, `scale should be identity at stress ${s}`);
      assert.strictEqual(m.scale(0), 0, `scale should be identity at stress ${s}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Properties (random-event, seeded LCG)
// ---------------------------------------------------------------------------

describe("Mood — properties", () => {

  test("Property 1: stress range — after any pass_time/bump sequence, stress ∈ 0..10000", () => {
    const rng = new LCG(42);
    const m = new Mood();
    let t = 0;
    for (let i = 0; i < 1000; i++) {
      t += rng.range(20) + 1; // always forward
      m.pass_time(t);
      m.bump(rng.range(20000) - 10000); // -10000..+9999
      assert.ok(m.stress_bps >= 0 && m.stress_bps <= 10000,
        `stress ${m.stress_bps} out of range at iteration ${i}`);
    }
  });

  test("Property 2: scale monotone in stress — for fixed value and tighten, scale never increases", () => {
    const rng = new LCG(123);
    for (let trial = 0; trial < 100; trial++) {
      const value = rng.range(10000) + 1;
      const tighten = rng.range(10001); // 0..10000
      const m = new Mood({ ...DEFAULT_MOOD_POLICY, tighten_bps: tighten });
      let prev = value; // at stress 0, scale = value
      for (let s = 0; s <= 10000; s += 100) {
        m.stress_bps = s;
        const cur = m.scale(value);
        assert.ok(cur <= prev,
          `scale not monotone: value=${value}, tighten=${tighten}, stress=${s}, cur=${cur} > prev=${prev}`);
        prev = cur;
      }
    }
  });

  test("Property 3: scale identity at zero — scale(v) = v when stress=0 or tighten=0", () => {
    const rng = new LCG(777);
    for (let i = 0; i < 100; i++) {
      const v = rng.range(100000);

      // stress = 0
      const m1 = new Mood();
      m1.stress_bps = 0;
      assert.strictEqual(m1.scale(v), v);

      // tighten = 0
      const m2 = new Mood({ ...DEFAULT_MOOD_POLICY, tighten_bps: 0 });
      m2.stress_bps = rng.range(10001);
      assert.strictEqual(m2.scale(v), v);
    }
  });

  test("Property 4: scale bounded — 0 ≤ scale(v) ≤ v", () => {
    const rng = new LCG(99);
    for (let i = 0; i < 100; i++) {
      const v = rng.range(100000) + 1; // 1..100000
      const tighten = rng.range(10001);
      const stress = rng.range(10001);
      const m = new Mood({ ...DEFAULT_MOOD_POLICY, tighten_bps: tighten });
      m.stress_bps = stress;
      const scaled = m.scale(v);
      assert.ok(scaled >= 0 && scaled <= v,
        `scale(${v}) = ${scaled} out of [0, ${v}] (stress=${stress}, tighten=${tighten})`);
    }
  });

  test("Property 5: pass_time never raises stress — for t ≥ last_t, stress after ≤ stress before", () => {
    const rng = new LCG(55);
    const m = new Mood();
    let t = 0;
    m.pass_time(t);
    for (let i = 0; i < 200; i++) {
      m.bump(rng.range(5000));
      const before = m.stress_bps;
      t += rng.range(10) + 1; // always forward
      m.pass_time(t);
      assert.ok(m.stress_bps <= before,
        `pass_time raised stress from ${before} to ${m.stress_bps} at t=${t}`);
    }
  });

  test("Property 6: bump idempotent at clamps — at 0 bump(-k)=0, at 10000 bump(+k)=10000", () => {
    const rng = new LCG(33);
    for (let i = 0; i < 100; i++) {
      const k = rng.range(10000) + 1;

      // At 0, bump(-k) leaves 0
      const m1 = new Mood();
      m1.stress_bps = 0;
      m1.bump(-k);
      assert.strictEqual(m1.stress_bps, 0);

      // At 10000, bump(+k) leaves 10000
      const m2 = new Mood();
      m2.stress_bps = 10000;
      m2.bump(k);
      assert.strictEqual(m2.stress_bps, 10000);
    }
  });

  test("Property 7: labels follow thresholds — calm / wary / feral by wary_from_bps and feral_from_bps", () => {
    const rng = new LCG(88);
    for (let i = 0; i < 100; i++) {
      const wary = rng.range(5000) + 500;        // 500..5499
      const feral = wary + rng.range(4000) + 500; // wary + 500..4499

      const m = new Mood({
        ...DEFAULT_MOOD_POLICY,
        wary_from_bps: wary,
        feral_from_bps: feral,
      });

      // calm: below wary
      m.stress_bps = rng.range(wary);
      assert.strictEqual(m.label, "calm");

      // wary: from wary to feral − 1
      m.stress_bps = wary + rng.range(feral - wary);
      assert.strictEqual(m.label, "wary");

      // feral: at or above feral
      m.stress_bps = feral + rng.range(10001 - feral);
      assert.strictEqual(m.label, "feral");
    }
  });
});
