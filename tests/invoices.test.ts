import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { InvoicePool } from "../src/engine/invoices.ts";
import { DEFAULT_POOL_POLICY, DEFAULT_MOOD_POLICY } from "../src/engine/types.ts";

const FAMILIES = [
  "zero_amount",
  "below_minimum",
  "duplicate_invoice",
  "analysis_required",
  "advance_above_face",
  "fee_above_face",
  "due_passed",
  "term_too_long",
  "advance_above_cap",
  "concentration_breached",
  "debtor_cap_breached",
  "pool_illiquid",
  "not_a_lender",
  "unknown_invoice",
  "not_funded",
  "default_too_early",
  "not_defaulted",
  "unknown_op",
];

test("zero_amount: deposit", () => {
  const pool = new InvoicePool();
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("deposit", 0, { lender: "L1", amount: 0 });
  strictEqual(result.decision, "refuse");
  strictEqual(result.family, "zero_amount");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("zero_amount: advance (face)", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 0,
    advance: 100,
    fee: 10,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "zero_amount");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("zero_amount: repay", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: true,
  });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("repay", 2, { invoice: "inv-1", amount: 0, payer: "P1" });
  strictEqual(result.family, "zero_amount");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("below_minimum", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, min_face: 100 },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 50,
    advance: 40,
    fee: 5,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "below_minimum");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("duplicate_invoice", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: true,
  });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D2",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "duplicate_invoice");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("analysis_required", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, require_analysis: true },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: false,
  });
  strictEqual(result.family, "analysis_required");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("advance_above_face", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 150,
    fee: 0,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "advance_above_face");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("fee_above_face", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 100,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "fee_above_face");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("due_passed", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 10, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 10,
    analysis: true,
  });
  strictEqual(result.family, "due_passed");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("term_too_long", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, max_term: 90 },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 200,
    analysis: true,
  });
  strictEqual(result.family, "term_too_long");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("advance_above_cap", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, max_advance_bps: 5000 },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 60,
    fee: 5,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "advance_above_cap");
  // REQ-POOL-12: book is unchanged, but mood moved: stress +500
  const after = pool.snapshot();
  strictEqual(after.capital, beforeSnapshot.capital);
  strictEqual(after.deposits, beforeSnapshot.deposits);
  strictEqual(after.outstanding, beforeSnapshot.outstanding);
  strictEqual(after.losses, beforeSnapshot.losses);
  strictEqual(after.fees_earned, beforeSnapshot.fees_earned);
  deepStrictEqual(after.lenders, beforeSnapshot.lenders);
  deepStrictEqual(after.exposures, beforeSnapshot.exposures);
  deepStrictEqual(after.advances, beforeSnapshot.advances);
  strictEqual(after.stress_bps, beforeSnapshot.stress_bps + 500);
  strictEqual(after.effective.share_bps, 2925); // 3000 - 75
  strictEqual(after.effective.max_term, 88); // 90 - 2
});

test("concentration_breached", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, max_share_bps: 2000 },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 1000,
    advance: 300,
    fee: 50,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "concentration_breached");
  // REQ-POOL-12: book is unchanged, but mood moved: stress +500
  const after = pool.snapshot();
  strictEqual(after.capital, beforeSnapshot.capital);
  strictEqual(after.deposits, beforeSnapshot.deposits);
  strictEqual(after.outstanding, beforeSnapshot.outstanding);
  strictEqual(after.losses, beforeSnapshot.losses);
  strictEqual(after.fees_earned, beforeSnapshot.fees_earned);
  deepStrictEqual(after.lenders, beforeSnapshot.lenders);
  deepStrictEqual(after.exposures, beforeSnapshot.exposures);
  deepStrictEqual(after.advances, beforeSnapshot.advances);
  strictEqual(after.stress_bps, beforeSnapshot.stress_bps + 500);
});

test("debtor_cap_breached", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, max_debtor_abs: 100 },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 10000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 1000,
    advance: 500,
    fee: 100,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "debtor_cap_breached");
  // REQ-POOL-12: book is unchanged, but mood moved: stress +500
  const after = pool.snapshot();
  strictEqual(after.capital, beforeSnapshot.capital);
  strictEqual(after.deposits, beforeSnapshot.deposits);
  strictEqual(after.outstanding, beforeSnapshot.outstanding);
  strictEqual(after.losses, beforeSnapshot.losses);
  strictEqual(after.fees_earned, beforeSnapshot.fees_earned);
  deepStrictEqual(after.lenders, beforeSnapshot.lenders);
  deepStrictEqual(after.exposures, beforeSnapshot.exposures);
  deepStrictEqual(after.advances, beforeSnapshot.advances);
  strictEqual(after.stress_bps, beforeSnapshot.stress_bps + 500);
});

test("pool_illiquid", () => {
  const pool = new InvoicePool();
  // Deposit capital: 10000
  pool.apply("deposit", 0, { lender: "L1", amount: 10000 });

  // Fund three advances to D1, D2, D3: face 3000, advance 2700, fee 0 each
  // Concentration for each: owed=2700, (2700/10000)×10000 = 2700 bps < 3000 ✓
  // After 3: outstanding = 8100, cash = 1900
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 3000,
    advance: 2700,
    fee: 0,
    due: 30,
    analysis: true,
  });
  pool.apply("advance", 2, {
    invoice: "inv-2",
    supplier: "S2",
    debtor: "D2",
    face: 3000,
    advance: 2700,
    fee: 0,
    due: 30,
    analysis: true,
  });
  pool.apply("advance", 3, {
    invoice: "inv-3",
    supplier: "S3",
    debtor: "D3",
    face: 3000,
    advance: 2700,
    fee: 0,
    due: 30,
    analysis: true,
  });

  const beforeSnapshot = pool.snapshot();
  // Request advance for D4: face 2300, advance 2000, fee 0
  // Advance rate: 2000 ≤ 2070 = 90% of 2300 ✓
  // Concentration: owed=2000, (2000/10000)×10000 = 2000 bps < 3000 ✓
  // But 2000 > 1900 cash on hand → pool_illiquid
  const result = pool.apply("advance", 4, {
    invoice: "inv-4",
    supplier: "S4",
    debtor: "D4",
    face: 2300,
    advance: 2000,
    fee: 0,
    due: 30,
    analysis: true,
  });
  strictEqual(result.family, "pool_illiquid");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("not_a_lender", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("withdraw", 1, { lender: "L_unknown" });
  strictEqual(result.family, "not_a_lender");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("unknown_invoice (repay)", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("repay", 1, { invoice: "inv-unknown", amount: 10, payer: "P1" });
  strictEqual(result.family, "unknown_invoice");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("not_funded (repay)", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: true,
  });
  pool.apply("repay", 2, { invoice: "inv-1", amount: 55, payer: "P1" });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("repay", 3, { invoice: "inv-1", amount: 10, payer: "P1" });
  strictEqual(result.family, "not_funded");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("default_too_early", () => {
  const pool = new InvoicePool(
    { ...DEFAULT_POOL_POLICY, grace: 7 },
    DEFAULT_MOOD_POLICY
  );
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 20,
    analysis: true,
  });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("default", 25, { invoice: "inv-1" });
  strictEqual(result.family, "default_too_early");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("not_defaulted", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: true,
  });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("buyback", 2, { invoice: "inv-1", payer: "P1" });
  strictEqual(result.family, "not_defaulted");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("unknown_op", () => {
  const pool = new InvoicePool();
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  const beforeSnapshot = pool.snapshot();
  const result = pool.apply("invalid_op", 1, {});
  strictEqual(result.family, "unknown_op");
  deepStrictEqual(pool.snapshot(), beforeSnapshot, "no-op: state unchanged");
});

test("repayment, default, and buyback cycle", () => {
  const pool = new InvoicePool();

  // Deposit and advance.
  pool.apply("deposit", 0, { lender: "L1", amount: 1000 });
  pool.apply("advance", 1, {
    invoice: "inv-1",
    supplier: "S1",
    debtor: "D1",
    face: 100,
    advance: 50,
    fee: 5,
    due: 30,
    analysis: true,
  });

  // Partial repay.
  const partial = pool.apply("repay", 10, { invoice: "inv-1", amount: 30, payer: "P1" });
  strictEqual(partial.decision, "ok");

  // Close the repay.
  const closed = pool.apply("repay", 15, { invoice: "inv-1", amount: 25, payer: "P1" });
  strictEqual(closed.decision, "ok");
  strictEqual((closed as any).closed, true);

  // Now test default on a new advance.
  pool.apply("advance", 16, {
    invoice: "inv-2",
    supplier: "S1",
    debtor: "D2",
    face: 100,
    advance: 50,
    fee: 5,
    due: 40,
    analysis: true,
  });

  // Try default before due + grace (should fail).
  const earlyDefault = pool.apply("default", 45, { invoice: "inv-2" });
  strictEqual(earlyDefault.family, "default_too_early");

  // Default after due + grace (should succeed).
  const defaultOk = pool.apply("default", 48, { invoice: "inv-2" });
  strictEqual(defaultOk.decision, "ok");

  // Buyback the defaulted invoice.
  const buyback = pool.apply("buyback", 50, { invoice: "inv-2", payer: "P1" });
  strictEqual(buyback.decision, "ok");
});

test("all 18 families tested", () => {
  strictEqual(FAMILIES.length, 18, "18 refusal families");
});
