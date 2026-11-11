// Shared types for the Ferret engine.
// All money and mood math is integer-only (no floats). See tech.md.

// ---------------------------------------------------------------------------
// Mood (from .kiro/specs/mood/design.md)
// ---------------------------------------------------------------------------

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
  stress_refusal_bps: 500,
  stress_default_bps: 3000,
  calm_repaid_bps: 1000,
  calm_buyback_bps: 500,
  decay_bps_per_tick: 100,
  tighten_bps: 5000,
  wary_from_bps: 2000,
  feral_from_bps: 6000,
};

export type MoodLabel = "calm" | "wary" | "feral";

// ---------------------------------------------------------------------------
// Invoice pool (from .kiro/specs/invoice-pool/design.md)
// ---------------------------------------------------------------------------

export interface PoolPolicy {
  max_share_bps: number;       // of the capital, what one debtor may owe
  max_debtor_abs: number;      // absolute cap per debtor, 0 = none
  max_advance_bps: number;     // advance ≤ this share of the face
  max_term: number;            // due date at most this many ticks away
  grace: number;               // a default may be written only after due + grace
  min_face: number;            // below it the fees are not worth the act
  require_analysis: boolean;   // the AI seat's analysis must exist
}

export const DEFAULT_POOL_POLICY: PoolPolicy = {
  max_share_bps: 3000,
  max_debtor_abs: 0,
  max_advance_bps: 9000,
  max_term: 90,
  grace: 7,
  min_face: 1,
  require_analysis: true,
};

export type AdvanceStatus = "funded" | "repaid" | "defaulted" | "bought_back";

export type Family =
  | "zero_amount"
  | "below_minimum"
  | "duplicate_invoice"
  | "analysis_required"
  | "advance_above_face"
  | "fee_above_face"
  | "due_passed"
  | "term_too_long"
  | "advance_above_cap"
  | "concentration_breached"
  | "debtor_cap_breached"
  | "pool_illiquid"
  | "not_a_lender"
  | "unknown_invoice"
  | "not_funded"
  | "default_too_early"
  | "not_defaulted"
  | "unknown_op";

/** Thrown by a handler when a check fails. `apply` catches, journals, bumps mood. */
export class Refused extends Error {
  readonly family: Family;
  constructor(family: Family, text: string) {
    super(text);
    this.name = "Refused";
    this.family = family;
  }
}

/** Internal record for a funded advance; only {status, repaid} is exposed in the snapshot. */
export interface AdvanceRecord {
  supplier: string;
  debtor: string;
  face: number;
  advance: number;
  fee: number;
  due: number;
  repaid: number;
  status: AdvanceStatus;
  funded_at: number;
}

export interface Snapshot {
  capital: number;
  deposits: number;
  outstanding: number;
  losses: number;
  fees_earned: number;
  lenders: Record<string, number>;
  exposures: Record<string, number>;
  advances: Record<string, { status: AdvanceStatus; repaid: number }>;
  stress_bps: number;
  mood: string;
  effective: { share_bps: number; max_term: number };
}

export type Decision =
  | { decision: "ok"; [k: string]: unknown }
  | { decision: "refuse"; family: Family };
