"""Burrow 1: the invoice-advance pool.

Rules carried over from dareskro's risk policy (facture/politique.mjs, 1 Nov 2026) and from the Solana
program (advance_approve / advance_repay / advance_default / advance_buyback, 5 Nov 2026), reduced to
one deterministic seat: the policy that says yes or no. No ledger, no signatures, no money moves here.

Amounts are integers in the pool's smallest unit. Time is an integer tick (a day in the demo).
A refusal carries a FAMILY (stable code); the text is for humans. The order of the checks is part of
the contract: the TypeScript engine must refuse for the same family on the same input."""
from dataclasses import dataclass, asdict
from .mood import Mood, MoodPolicy, BPS

class Refused(Exception):
    def __init__(self, family: str, text: str):
        super().__init__(text); self.family = family; self.text = text

@dataclass(frozen=True)
class PoolPolicy:
    max_share_bps: int = 3000      # of the capital, what one debtor may owe, the new advance and its fee included
    max_debtor_abs: int = 0        # absolute cap per debtor, 0 = none
    max_advance_bps: int = 9000    # advance ≤ this share of the face
    max_term: int = 90             # due date at most this many ticks away
    grace: int = 7                 # a default may be written only after due + grace
    min_face: int = 1              # below it the fees are not worth the act
    require_analysis: bool = True  # the AI seat's analysis must exist (its hash); the code never reads it

    @classmethod
    def from_json(cls, d): return cls(**d)
    def to_json(self): return asdict(self)

FUNDED, REPAID, DEFAULTED, BOUGHT_BACK = "funded", "repaid", "defaulted", "bought_back"
MOOD_RAISING_REFUSALS = ("advance_above_cap", "concentration_breached", "debtor_cap_breached")

class InvoicePool:
    def __init__(self, policy: PoolPolicy, mood_policy: MoodPolicy):
        self.policy, self.mood = policy, Mood(mood_policy)
        self.capital = 0; self.deposits = 0; self.outstanding = 0; self.losses = 0; self.fees_earned = 0
        self.lenders = {}      # lender -> deposit
        self.exposures = {}    # debtor -> owed (advances + fees not yet repaid)
        self.advances = {}     # invoice id -> record
        self.journal = []

    # --- what the mood changes: the ceilings in force right now
    def effective(self):
        return {"share_bps": self.mood.scale(self.policy.max_share_bps), "max_term": self.mood.scale(self.policy.max_term)}

    # --- the one entry point
    def apply(self, op: str, t: int, **args):
        """Applies one event at time t. Returns the handler's result, or raises Refused. Either way the journal
        and the mood are updated: the mood reacts to the DECISION, never to the inputs."""
        self.mood.pass_time(t)
        handler = {"deposit": self._deposit, "withdraw": self._withdraw, "advance": self._advance,
                   "repay": self._repay, "default": self._default, "buyback": self._buyback}.get(op)
        entry = {"t": t, "op": op, **args}
        try:
            if handler is None: raise Refused("unknown_op", f"unknown operation {op!r}")
            result = handler(t, **args)
        except Refused as e:
            if op == "advance" and e.family in MOOD_RAISING_REFUSALS: self.mood.bump(self.mood.p.stress_refusal_bps)
            self.journal.append({**entry, "decision": "refuse", "family": e.family, "text": e.text,
                                 "stress_bps": self.mood.stress_bps, "mood": self.mood.label})
            raise
        if op == "default": self.mood.bump(self.mood.p.stress_default_bps)
        elif op == "repay" and result.get("closed"): self.mood.bump(-self.mood.p.calm_repaid_bps)
        elif op == "buyback": self.mood.bump(-self.mood.p.calm_buyback_bps)
        self.journal.append({**entry, "decision": "ok", **result, "stress_bps": self.mood.stress_bps, "mood": self.mood.label})
        return result

    # --- lenders
    def _deposit(self, t, lender, amount):
        if amount <= 0: raise Refused("zero_amount", "deposit must be positive")
        self.lenders[lender] = self.lenders.get(lender, 0) + amount
        self.capital += amount; self.deposits += amount
        return {"capital": self.capital}

    def _withdraw(self, t, lender):
        """A lender leaves with its share of the book: deposit × capital ÷ deposits (floored). Losses lower it,
        fees raise it; only cash not out on advances can leave."""
        if lender not in self.lenders: raise Refused("not_a_lender", f"{lender} has no deposit")
        deposit = self.lenders[lender]
        share = deposit * self.capital // self.deposits
        if share > self.capital - self.outstanding: raise Refused("pool_illiquid", f"share {share} > cash on hand {self.capital - self.outstanding}")
        del self.lenders[lender]; self.deposits -= deposit; self.capital -= share
        return {"paid": share}

    # --- the advance: the checks, in this order
    def _advance(self, t, invoice, supplier, debtor, face, advance, fee, due, analysis):
        p, eff = self.policy, self.effective()
        if invoice in self.advances: raise Refused("duplicate_invoice", f"invoice {invoice} already seen")
        if p.require_analysis and not analysis: raise Refused("analysis_required", "no analysis from the AI seat")
        if face <= 0 or advance <= 0: raise Refused("zero_amount", "face and advance must be positive")
        if face < p.min_face: raise Refused("below_minimum", f"face {face} < minimum {p.min_face}")
        if advance > face: raise Refused("advance_above_face", f"advance {advance} > face {face}")
        if fee < 0 or fee > face - advance: raise Refused("fee_above_face", f"fee {fee} does not fit in face − advance = {face - advance}")
        if due <= t: raise Refused("due_passed", f"due {due} is not after now {t}")
        if due > t + eff["max_term"]: raise Refused("term_too_long", f"due in {due - t} ticks > {eff['max_term']} allowed now (policy {p.max_term}, mood {self.mood.label})")
        if advance * BPS > face * p.max_advance_bps: raise Refused("advance_above_cap", f"advance {advance} > {p.max_advance_bps} bps of face {face}")
        owed = advance + fee
        already = self.exposures.get(debtor, 0)
        if (already + owed) * BPS > self.capital * eff["share_bps"]:
            raise Refused("concentration_breached", f"debtor {debtor} would owe {already + owed} of capital {self.capital} > {eff['share_bps']} bps allowed now (policy {p.max_share_bps}, mood {self.mood.label})")
        if p.max_debtor_abs and already + owed > p.max_debtor_abs: raise Refused("debtor_cap_breached", f"debtor {debtor} would owe {already + owed} > {p.max_debtor_abs}")
        if advance > self.capital - self.outstanding: raise Refused("pool_illiquid", f"advance {advance} > cash on hand {self.capital - self.outstanding}")
        self.outstanding += advance
        self.exposures[debtor] = already + owed
        self.advances[invoice] = {"supplier": supplier, "debtor": debtor, "face": face, "advance": advance, "fee": fee,
                                  "due": due, "repaid": 0, "status": FUNDED, "funded_at": t}
        return {"owed": owed, "share_bps_after": (already + owed) * BPS // self.capital, "effective": eff}

    def _release(self, debtor, owed):
        left = self.exposures.get(debtor, 0) - owed
        if left > 0: self.exposures[debtor] = left
        else: self.exposures.pop(debtor, None)

    # --- repayment, default, buyback
    def _repay(self, t, invoice, amount, payer=None):
        a = self.advances.get(invoice)
        if a is None: raise Refused("unknown_invoice", f"invoice {invoice} unknown")
        if a["status"] != FUNDED: raise Refused("not_funded", f"invoice {invoice} is {a['status']}")
        if amount <= 0: raise Refused("zero_amount", "repayment must be positive")
        a["repaid"] += amount
        owed = a["advance"] + a["fee"]
        if a["repaid"] < owed: return {"closed": False, "still_owed": owed - a["repaid"]}
        to_supplier = a["repaid"] - owed
        self.outstanding -= a["advance"]; self.capital += a["fee"]; self.fees_earned += a["fee"]
        self._release(a["debtor"], owed); a["status"] = REPAID; a["closed_at"] = t
        return {"closed": True, "to_pool": owed, "to_supplier": to_supplier, "on_time": t <= a["due"]}

    def _default(self, t, invoice):
        a = self.advances.get(invoice)
        if a is None: raise Refused("unknown_invoice", f"invoice {invoice} unknown")
        if a["status"] != FUNDED: raise Refused("not_funded", f"invoice {invoice} is {a['status']}")
        if t < a["due"] + self.policy.grace: raise Refused("default_too_early", f"default allowed from {a['due'] + self.policy.grace}, now {t}")
        owed = a["advance"] + a["fee"]
        loss = a["advance"] - min(a["repaid"], a["advance"])
        fee_got = max(0, a["repaid"] - a["advance"])
        self.capital += fee_got - loss; self.fees_earned += fee_got; self.losses += loss
        self.outstanding -= a["advance"]; self._release(a["debtor"], owed)
        a["status"] = DEFAULTED; a["closed_at"] = t
        return {"loss": loss, "recovered": a["repaid"], "unpaid": owed - a["repaid"]}

    def _buyback(self, t, invoice, payer=None):
        a = self.advances.get(invoice)
        if a is None: raise Refused("unknown_invoice", f"invoice {invoice} unknown")
        if a["status"] != DEFAULTED: raise Refused("not_defaulted", f"invoice {invoice} is {a['status']}")
        owed = a["advance"] + a["fee"]
        unpaid = owed - a["repaid"]
        loss = a["advance"] - min(a["repaid"], a["advance"])
        self.capital += unpaid; self.losses -= loss; self.fees_earned += unpaid - loss
        a["repaid"] = owed; a["status"] = BOUGHT_BACK
        return {"paid": unpaid, "loss_cleared": loss}

    # --- what a replayer compares
    def snapshot(self):
        return {"capital": self.capital, "deposits": self.deposits, "outstanding": self.outstanding,
                "losses": self.losses, "fees_earned": self.fees_earned,
                "lenders": dict(sorted(self.lenders.items())), "exposures": dict(sorted(self.exposures.items())),
                "advances": {k: {"status": v["status"], "repaid": v["repaid"]} for k, v in sorted(self.advances.items())},
                "stress_bps": self.mood.stress_bps, "mood": self.mood.label, "effective": self.effective()}
