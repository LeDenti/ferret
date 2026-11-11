#!/usr/bin/env python3
"""Case generator for Ferret's differential test.

Drives the Python reference oracle (python/ferret/) through random event sequences on random policies and
records, for each event, the decision, the family of the refusal if any, and a snapshot of the pool and the
mood afterwards. The TypeScript engine built in Kiro replays the file: same inputs, same decision, same
family, same snapshot. Two implementations, one verdict.

Deterministic: same seed, same file, byte for byte. Integer arithmetic only on both sides.

Usage:  python generate_cases.py [--seed 20261111] [--scenarios 120] [--out cases.json]
"""
import argparse, json, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "python"))
from ferret.mood import MoodPolicy                       # noqa: E402
from ferret.invoices import InvoicePool, PoolPolicy, Refused, FUNDED, DEFAULTED  # noqa: E402

FORMAT = "ferret-cases/1"
FAMILIES = ["zero_amount", "below_minimum", "duplicate_invoice", "analysis_required", "advance_above_face",
            "fee_above_face", "due_passed", "term_too_long", "advance_above_cap", "concentration_breached",
            "debtor_cap_breached", "pool_illiquid", "not_a_lender", "unknown_invoice", "not_funded",
            "default_too_early", "not_defaulted", "unknown_op"]

def make_policies(rng):
    kind = rng.choice(["demo", "demo", "strict", "loose", "nomood", "absolute"])
    pool = dict(max_share_bps=3000, max_debtor_abs=0, max_advance_bps=9000, max_term=90, grace=7, min_face=1, require_analysis=True)
    mood = dict(MoodPolicy().to_json())
    if kind == "strict": pool.update(max_share_bps=2000, max_advance_bps=8000, max_term=45, grace=0, min_face=100); mood.update(stress_refusal_bps=1000, decay_bps_per_tick=50)
    elif kind == "loose": pool.update(max_share_bps=5000, max_advance_bps=9500, max_term=120, grace=14); mood.update(tighten_bps=2500, decay_bps_per_tick=200)
    elif kind == "nomood": mood.update(tighten_bps=0)                        # control: the mood changes nothing
    elif kind == "absolute": pool.update(max_debtor_abs=rng.choice([500, 2000, 5000]))
    if rng.random() < 0.2: pool["require_analysis"] = False
    if rng.random() < 0.2: mood["tighten_bps"] = rng.choice([0, 2500, 5000, 10000])
    if rng.random() < 0.2: mood["decay_bps_per_tick"] = rng.choice([0, 25, 100, 500])
    return kind, PoolPolicy.from_json(pool), MoodPolicy.from_json(mood)

def pick_funded(rng, pool, status=FUNDED):
    ids = [k for k, v in pool.advances.items() if v["status"] == status]
    return rng.choice(ids) if ids else None

def random_event(rng, pool, t, lenders, debtors, suppliers, next_invoice):
    """Returns (label, op, args). Labels are hints for a human reader, nothing more."""
    p = pool.policy
    cash = pool.capital - pool.outstanding
    r = rng.random()
    if pool.capital == 0 or r < 0.06:
        return "deposit", "deposit", {"lender": rng.choice(lenders), "amount": rng.choice([1000, 5000, 10000, 20000, 50000])}
    if r < 0.09:
        return "withdraw", "withdraw", {"lender": rng.choice(lenders + ["nobody"])}
    if r < 0.50:                                                           # an ordinary advance request, usually within bounds
        face = max(1, rng.randint(50, max(60, pool.capital // rng.choice([2, 3, 5, 8, 12]))))
        bps = rng.choice([9000, 9000, 8500, 8000, 9500, 10000])
        advance = face * bps // 10000; fee = face * rng.choice([100, 200, 300]) // 10000
        fee = min(fee, face - advance) if face - advance >= 0 else fee
        due = t + rng.choice([7, 7, 14, 14, 30, 30, 45, 60, 89, 90, 91, 120])
        return "advance", "advance", {"invoice": f"INV-{next_invoice:04d}", "supplier": rng.choice(suppliers), "debtor": rng.choice(debtors),
                                      "face": face, "advance": max(1, advance), "fee": max(0, fee), "due": due, "analysis": rng.random() > 0.08}
    if r < 0.60:                                                           # a defective request, one defect each
        face = rng.randint(50, 5000); advance = face * 9000 // 10000; fee = face * 200 // 10000
        args = {"invoice": f"INV-{next_invoice:04d}", "supplier": rng.choice(suppliers), "debtor": rng.choice(debtors),
                "face": face, "advance": advance, "fee": fee, "due": t + 30, "analysis": True}
        defect = rng.choice(["zero_face", "zero_advance", "advance_over_face", "fee_over", "negative_fee", "due_now", "due_past",
                             "term_long", "duplicate", "no_analysis", "below_min", "huge"])
        if defect == "zero_face": args.update(face=0, advance=0)
        elif defect == "zero_advance": args["advance"] = 0
        elif defect == "advance_over_face": args["advance"] = face + rng.randint(1, 100)
        elif defect == "fee_over": args["fee"] = face - advance + rng.randint(1, 50)
        elif defect == "negative_fee": args["fee"] = -1
        elif defect == "due_now": args["due"] = t
        elif defect == "due_past": args["due"] = t - rng.randint(1, 30)
        elif defect == "term_long": args["due"] = t + p.max_term + rng.randint(1, 60)
        elif defect == "duplicate" and pool.advances: args["invoice"] = rng.choice(sorted(pool.advances))
        elif defect == "no_analysis": args["analysis"] = False
        elif defect == "below_min": args.update(face=max(0, p.min_face - 1), advance=max(1, (p.min_face - 1) * 9 // 10))
        elif defect == "huge": args.update(face=pool.capital * 3 + 1000, advance=(pool.capital * 3 + 1000) * 9 // 10, fee=0)
        return "defective_" + defect, "advance", args
    if r < 0.78:                                                           # repayments: full, partial, over, on a wrong invoice
        inv = pick_funded(rng, pool)
        if inv is None:
            if rng.random() < 0.15: return "repay_unknown", "repay", {"invoice": "INV-9999", "amount": 10}
            return random_event(rng, pool, t, lenders, debtors, suppliers, next_invoice)
        a = pool.advances[inv]; owed = a["advance"] + a["fee"] - a["repaid"]
        kind = rng.choice(["full", "full", "partial", "over", "zero"])
        amount = {"full": owed, "partial": max(1, owed // rng.choice([2, 3, 4])), "over": owed + rng.randint(1, 100), "zero": 0}[kind]
        return "repay_" + kind, "repay", {"invoice": inv, "amount": amount, "payer": a["debtor"]}
    if r < 0.88:                                                           # defaults, early or late, sometimes on a closed invoice
        inv = pick_funded(rng, pool) or pick_funded(rng, pool, "repaid")
        if inv is None: return random_event(rng, pool, t, lenders, debtors, suppliers, next_invoice)
        return "default", "default", {"invoice": inv}
    if r < 0.94:
        inv = pick_funded(rng, pool, DEFAULTED) or pick_funded(rng, pool) or "INV-9999"
        return "buyback", "buyback", {"invoice": inv, "payer": rng.choice(suppliers)}
    if r < 0.97:
        return "repay_wrong_status", "repay", {"invoice": pick_funded(rng, pool, "repaid") or pick_funded(rng, pool, DEFAULTED) or "INV-9999", "amount": 5}
    return "unknown_op", "seize", {"invoice": "INV-0001"}

def run_scenario(rng, sid):
    kind, pool_policy, mood_policy = make_policies(rng)
    pool = InvoicePool(pool_policy, mood_policy)
    lenders = [f"L{i}" for i in range(1, rng.choice([2, 3]) + 1)]
    debtors = [f"D{i}" for i in range(1, rng.choice([1, 2, 2, 3, 4]) + 1)]
    suppliers = [f"S{i}" for i in range(1, 3)]
    t, next_invoice, steps = 0, 1, []
    for i in range(rng.randint(25, 60)):
        t += rng.choice([0, 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 34, 60, 100, 100]) if i else 0
        label, op, args = random_event(rng, pool, t, lenders, debtors, suppliers, next_invoice)
        if op == "advance": next_invoice += 1
        try: pool.apply(op, t, **args); expect = {"decision": "ok"}
        except Refused as e:
            expect = {"decision": "refuse", "family": e.family}
            if e.family == "term_too_long" and args["due"] <= t + pool_policy.max_term: expect["mood_decisive"] = True
            if e.family == "concentration_breached":
                owed = args["advance"] + args["fee"]; already = pool.exposures.get(args["debtor"], 0)
                if (already + owed) * 10000 <= pool.capital * pool_policy.max_share_bps: expect["mood_decisive"] = True
        steps.append({"i": i, "t": t, "op": op, "args": args, "label": label, "expect": expect, "after": pool.snapshot()})
    return {"id": f"{kind}-{sid:04d}", "pool_policy": pool_policy.to_json(), "mood_policy": mood_policy.to_json(), "steps": steps}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261111)
    ap.add_argument("--scenarios", type=int, default=120)
    ap.add_argument("--out", default=os.path.join(HERE, "cases.json"))
    a = ap.parse_args()
    rng = random.Random(a.seed)
    scenarios = [run_scenario(rng, i + 1) for i in range(a.scenarios)]
    by, moods, n = {}, {}, 0
    for s in scenarios:
        for st in s["steps"]:
            n += 1; k = st["expect"].get("family", "ok"); by[k] = by.get(k, 0) + 1
            m = st["after"]["mood"]; moods[m] = moods.get(m, 0) + 1
            if st["expect"].get("mood_decisive"): by["(mood decisive)"] = by.get("(mood decisive)", 0) + 1
    missing = [f for f in FAMILIES if f not in by]
    doc = {"format": FORMAT, "seed": a.seed, "oracle": "reference/python/ferret (11 Nov 2026)", "generator": "reference/generate_cases.py",
           "families": FAMILIES, "scenarios": scenarios,
           "summary": {"scenarios": len(scenarios), "steps": n, "by_outcome": dict(sorted(by.items())), "moods": dict(sorted(moods.items()))}}
    with open(a.out, "w", encoding="utf-8") as fh: json.dump(doc, fh, ensure_ascii=False, indent=0); fh.write("\n")
    print(f"{a.out}: {len(scenarios)} scenarios, {n} steps; moods {moods}")
    for k, v in sorted(by.items(), key=lambda kv: -kv[1]): print(f"  {k:24s} {v}")
    if missing: print("FAMILIES NEVER HIT:", missing)

if __name__ == "__main__": main()
