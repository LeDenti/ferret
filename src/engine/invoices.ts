// Invoice pool: a book of play money that advances cash on invoices.
// Every request passes twelve ordered checks and gets a yes or a no with a stable family code.
// The mood scales two ceilings (share_bps, max_term) so a wary ferret lends less.
// All money math is integer-only (no floats), matching tech.md and the Python oracle.

import {
  DEFAULT_MOOD_POLICY,
  DEFAULT_POOL_POLICY,
  type AdvanceRecord,
  type AdvanceStatus,
  type Decision,
  type Family,
  type PoolPolicy,
  type Snapshot,
  Refused,
} from "./types.ts";
import { Mood, type MoodPolicy } from "./mood.ts";

const BPS = 10_000;
const MOOD_RAISING: ReadonlySet<Family> = new Set([
  "advance_above_cap",
  "concentration_breached",
  "debtor_cap_breached",
]);

export class InvoicePool {
  readonly policy: PoolPolicy;
  readonly mood: Mood;

  capital = 0;
  deposits = 0;
  outstanding = 0;
  losses = 0;
  fees_earned = 0;

  lenders: Record<string, number> = {};
  exposures: Record<string, number> = {};
  advances: Record<string, AdvanceRecord> = {};
  journal: object[] = [];

  constructor(
    policy: PoolPolicy = DEFAULT_POOL_POLICY,
    mp: MoodPolicy = DEFAULT_MOOD_POLICY
  ) {
    this.policy = policy;
    this.mood = new Mood(mp);
  }

  /** REQ-MOOD-09: returns effective share_bps and max_term scaled by mood. */
  private effective() {
    return {
      share_bps: this.mood.scale(this.policy.max_share_bps),
      max_term: this.mood.scale(this.policy.max_term),
    };
  }

  /** REQ-POOL-03: single entry point. Calls mood.pass_time(t), dispatches op, journals, reacts with mood bumps. */
  apply(op: string, t: number, args: Record<string, unknown>): Decision {
    this.mood.pass_time(t);

    const handler =
      op === "deposit"
        ? () => this._deposit(args.lender as string, args.amount as number)
        : op === "withdraw"
          ? () => this._withdraw(args.lender as string)
          : op === "advance"
            ? () =>
                this._advance(
                  args.invoice as string,
                  args.supplier as string,
                  args.debtor as string,
                  args.face as number,
                  args.advance as number,
                  args.fee as number,
                  args.due as number,
                  args.analysis as unknown,
                  t
                )
            : op === "repay"
              ? () =>
                  this._repay(
                    args.invoice as string,
                    args.amount as number,
                    args.payer as string,
                    t
                  )
              : op === "default"
                ? () => this._default(args.invoice as string, t)
                : op === "buyback"
                  ? () => this._buyback(args.invoice as string, args.payer as string, t)
                  : null;

    const entry = { t, op, ...args };

    try {
      if (!handler) throw new Refused("unknown_op", `unknown op ${op}`);
      const result = handler();

      // Mood bumps based on decision and operation (REQ-POOL-03, REQ-MOOD-04..08).
      if (op === "default") {
        this.mood.bump(this.mood.p.stress_default_bps);
      } else if (op === "repay" && (result as any).closed) {
        this.mood.bump(-this.mood.p.calm_repaid_bps);
      } else if (op === "buyback") {
        this.mood.bump(-this.mood.p.calm_buyback_bps);
      }

      this.journal.push({
        ...entry,
        decision: "ok",
        ...result,
        stress_bps: this.mood.stress_bps,
        mood: this.mood.label,
      });

      return { decision: "ok", ...result };
    } catch (e) {
      const family = (e as Refused).family;

      // Mood bump on ceiling refusal (REQ-POOL-03, REQ-MOOD-07).
      if (op === "advance" && MOOD_RAISING.has(family)) {
        this.mood.bump(this.mood.p.stress_refusal_bps);
      }

      this.journal.push({
        ...entry,
        decision: "refuse",
        family,
        stress_bps: this.mood.stress_bps,
        mood: this.mood.label,
      });

      return { decision: "refuse", family };
    }
  }

  /** REQ-POOL-04: deposit lender amount into capital. */
  private _deposit(lender: string, amount: number) {
    if (amount <= 0) throw new Refused("zero_amount", "amount must be positive");
    this.lenders[lender] = (this.lenders[lender] ?? 0) + amount;
    this.capital += amount;
    this.deposits += amount;
    return {};
  }

  /** REQ-POOL-05: withdraw lender's share from capital (floored, only from liquid cash). */
  private _withdraw(lender: string) {
    const deposit = this.lenders[lender];
    if (deposit === undefined)
      throw new Refused("not_a_lender", `lender ${lender} is unknown`);

    // share = floor(deposit × capital ÷ deposits)
    const share = Math.floor((deposit * this.capital) / this.deposits);
    const liquid = this.capital - this.outstanding;

    if (share > liquid)
      throw new Refused("pool_illiquid", "not enough liquid capital");

    delete this.lenders[lender];
    this.deposits -= deposit;
    this.capital -= share;

    return { paid: share };
  }

  /** REQ-POOL-06: twelve checks in order, then fund the advance. */
  private _advance(
    invoice: string,
    supplier: string,
    debtor: string,
    face: number,
    advance: number,
    fee: number,
    due: number,
    analysis: unknown,
    t: number
  ) {
    // Check 1: duplicate_invoice
    if (this.advances[invoice])
      throw new Refused("duplicate_invoice", `invoice ${invoice} already exists`);

    // Check 2: analysis_required
    if (this.policy.require_analysis && !analysis)
      throw new Refused("analysis_required", "analysis is required");

    // Check 3: zero_amount
    if (face <= 0 || advance <= 0)
      throw new Refused("zero_amount", "face and advance must be positive");

    // Check 4: below_minimum
    if (face < this.policy.min_face)
      throw new Refused("below_minimum", `face < min_face ${this.policy.min_face}`);

    // Check 5: advance_above_face
    if (advance > face)
      throw new Refused("advance_above_face", "advance exceeds face");

    // Check 6: fee_above_face
    if (fee < 0 || fee > face - advance)
      throw new Refused(
        "fee_above_face",
        "fee must be non-negative and not exceed face - advance"
      );

    // Check 7: due_passed
    if (due <= t) throw new Refused("due_passed", "due date has passed");

    // Get effective ceilings (mood-scaled).
    const eff = this.effective();

    // Check 8: term_too_long
    if (due > t + eff.max_term)
      throw new Refused("term_too_long", `term exceeds ${eff.max_term}`);

    // Check 9: advance_above_cap
    // advance × 10000 > face × max_advance_bps
    // Guard: advance × BPS must fit in MAX_SAFE_INTEGER.
    if (advance > Math.floor(Number.MAX_SAFE_INTEGER / BPS)) {
      throw new RangeError("pool arithmetic overflow");
    }
    if (advance * BPS > face * this.policy.max_advance_bps)
      throw new Refused("advance_above_cap", "advance exceeds cap");

    const already = this.exposures[debtor] ?? 0;
    const owed = advance + fee;

    // Check 10: concentration_breached
    // (already + owed) × 10000 > capital × eff.share_bps
    // Guard: (already + owed) × BPS must fit in MAX_SAFE_INTEGER.
    const combined = already + owed;
    if (combined > Math.floor(Number.MAX_SAFE_INTEGER / BPS)) {
      throw new RangeError("pool arithmetic overflow");
    }
    if (combined * BPS > this.capital * eff.share_bps)
      throw new Refused("concentration_breached", "debtor concentration exceeds limit");

    // Check 11: debtor_cap_breached
    if (this.policy.max_debtor_abs !== 0 && already + owed > this.policy.max_debtor_abs)
      throw new Refused("debtor_cap_breached", "debtor absolute cap exceeded");

    // Check 12: pool_illiquid
    const liquid = this.capital - this.outstanding;
    if (advance > liquid)
      throw new Refused("pool_illiquid", "insufficient liquid capital");

    // All checks passed: fund the advance.
    this.outstanding += advance;
    this.exposures[debtor] = already + owed;
    this.advances[invoice] = {
      supplier,
      debtor,
      face,
      advance,
      fee,
      due,
      repaid: 0,
      status: "funded",
      funded_at: t,
    };

    return { advanced: advance };
  }

  /** REQ-POOL-07: repay invoice. Partial vs closing, surplus to supplier. */
  private _repay(invoice: string, amount: number, payer: string, t: number) {
    const rec = this.advances[invoice];
    if (!rec) throw new Refused("unknown_invoice", `invoice ${invoice} not found`);
    if (rec.status !== "funded")
      throw new Refused("not_funded", `invoice ${invoice} is not funded`);
    if (amount <= 0) throw new Refused("zero_amount", "amount must be positive");

    rec.repaid += amount;
    const owed = rec.advance + rec.fee;

    // Partial repay.
    if (rec.repaid < owed) {
      return { partial: true };
    }

    // Closing repay.
    this.outstanding -= rec.advance;
    this.capital += rec.fee;
    this.fees_earned += rec.fee;
    this._release(rec.debtor, owed);
    rec.status = "repaid";

    return { closed: true, to_pool: owed, to_supplier: rec.repaid - owed };
  }

  /** REQ-POOL-08: default on an invoice (due + grace, loss, fee_got, book changes). */
  private _default(invoice: string, t: number) {
    const rec = this.advances[invoice];
    if (!rec) throw new Refused("unknown_invoice", `invoice ${invoice} not found`);
    if (rec.status !== "funded")
      throw new Refused("not_funded", `invoice ${invoice} is not funded`);
    if (t < rec.due + this.policy.grace)
      throw new Refused("default_too_early", "default window not yet open");

    const owed = rec.advance + rec.fee;
    const loss = rec.advance - Math.min(rec.repaid, rec.advance);
    const fee_got = Math.max(0, rec.repaid - rec.advance);

    this.capital += fee_got - loss;
    this.fees_earned += fee_got;
    this.losses += loss;
    this.outstanding -= rec.advance;
    this._release(rec.debtor, owed);
    rec.status = "defaulted";

    return { loss, fee_got };
  }

  /** REQ-POOL-09: buyback a defaulted invoice. */
  private _buyback(invoice: string, payer: string, t: number) {
    const rec = this.advances[invoice];
    if (!rec) throw new Refused("unknown_invoice", `invoice ${invoice} not found`);
    if (rec.status !== "defaulted")
      throw new Refused("not_defaulted", `invoice ${invoice} is not defaulted`);

    const owed = rec.advance + rec.fee;
    const unpaid = owed - rec.repaid;
    const loss = rec.advance - Math.min(rec.repaid, rec.advance);

    this.capital += unpaid;
    this.losses -= loss;
    this.fees_earned += unpaid - loss;
    rec.repaid = owed;
    rec.status = "bought_back";

    return { unpaid, loss };
  }

  /** REQ-POOL-10: release exposure for a debtor by owed amount (no zero entries). */
  private _release(debtor: string, owed: number) {
    const left = (this.exposures[debtor] ?? 0) - owed;
    if (left > 0) {
      this.exposures[debtor] = left;
    } else {
      delete this.exposures[debtor];
    }
  }

  /** REQ-POOL-11: snapshot with sorted keys exactly as required. */
  snapshot(): Snapshot {
    const sort = (o: Record<string, number>) =>
      Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

    return {
      capital: this.capital,
      deposits: this.deposits,
      outstanding: this.outstanding,
      losses: this.losses,
      fees_earned: this.fees_earned,
      lenders: sort(this.lenders),
      exposures: sort(this.exposures),
      advances: Object.fromEntries(
        Object.keys(this.advances)
          .sort()
          .map((k) => [k, { status: this.advances[k].status, repaid: this.advances[k].repaid }])
      ),
      stress_bps: this.mood.stress_bps,
      mood: this.mood.label,
      effective: this.effective(),
    };
  }
}
