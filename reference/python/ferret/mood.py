"""The ferret's mood.

Transposed from XRPLife's sentiment layer (measured on the XRP Ledger testnet, 4 November 2026):
a neuromodulator changes HOW MUCH the organism does, not WHAT it does. Serotonin (fed) lowered the
total activity, PDF-1 (hungry) raised it, and neither changed where the activity went.

Here the same split: the mood scales the ceilings and the term (vigour), never the list of rules,
their order, or the family of a refusal. Mood is one integer, stress in basis points (0..10000):
  rises when a debtor pushes past a ceiling (alert) and when an advance defaults (hungry),
  falls when an advance is repaid in full or bought back (fed),
  fades with time (recapture).
Integer arithmetic only."""
from dataclasses import dataclass, asdict

BPS = 10_000

@dataclass(frozen=True)
class MoodPolicy:
    stress_refusal_bps: int = 500        # a debtor pushing past a ceiling
    stress_default_bps: int = 3000       # an advance defaults
    calm_repaid_bps: int = 1000          # an advance repaid in full
    calm_buyback_bps: int = 500          # a defaulted advance bought back
    decay_bps_per_tick: int = 100        # stress that fades per tick (a tick is a day in the demo)
    tighten_bps: int = 5000              # at full stress a ceiling shrinks by this share (5000 = halved; 0 = mood has no effect)
    wary_from_bps: int = 2000            # labels only, for the screen
    feral_from_bps: int = 6000

    @classmethod
    def from_json(cls, d): return cls(**d)
    def to_json(self): return asdict(self)

class Mood:
    def __init__(self, policy: MoodPolicy):
        self.p = policy; self.stress_bps = 0; self.last_t = None

    def pass_time(self, t: int):
        """Called once per event with its time. Stress fades by decay × elapsed ticks. Time never goes back."""
        if self.last_t is not None:
            if t < self.last_t: raise ValueError("clock went backwards")
            self.stress_bps = max(0, self.stress_bps - self.p.decay_bps_per_tick * (t - self.last_t))
        self.last_t = t

    def bump(self, delta_bps: int):
        self.stress_bps = min(BPS, max(0, self.stress_bps + delta_bps))

    @property
    def label(self) -> str:
        if self.stress_bps >= self.p.feral_from_bps: return "feral"
        if self.stress_bps >= self.p.wary_from_bps: return "wary"
        return "calm"

    def scale(self, value: int) -> int:
        """value × (1 − stress/BPS × tighten/BPS), floored. At stress 0 the value is unchanged."""
        return value - (value * self.stress_bps * self.p.tighten_bps) // (BPS * BPS)
