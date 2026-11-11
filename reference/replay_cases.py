#!/usr/bin/env python3
"""Replays cases.json against the Python oracle and checks every expectation: decision, family, snapshot.

The Python side of the differential test. Forty lines that show what a replayer has to do; the TypeScript
tests built in Kiro do the same against the TypeScript engine.

Usage:  python replay_cases.py [cases.json]      exit code 0 when every expectation holds
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "python"))
from ferret.mood import MoodPolicy                    # noqa: E402
from ferret.invoices import InvoicePool, PoolPolicy, Refused  # noqa: E402

def replay(doc):
    failures, n = [], 0
    for sc in doc["scenarios"]:
        pool = InvoicePool(PoolPolicy.from_json(sc["pool_policy"]), MoodPolicy.from_json(sc["mood_policy"]))
        for st in sc["steps"]:
            n += 1
            try: pool.apply(st["op"], st["t"], **st["args"]); got = {"decision": "ok"}
            except Refused as e: got = {"decision": "refuse", "family": e.family}
            after = pool.snapshot()
            want = {k: v for k, v in st["expect"].items() if k != "mood_decisive"}   # informative flag, not compared
            if got != want or after != st["after"]:
                failures.append((sc["id"], st["i"], st["label"], got, st["expect"]))
    return n, failures

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "cases.json")
    n, failures = replay(json.load(open(path, encoding="utf-8")))
    for f in failures[:20]: print("FAIL", f)
    print(f"{n} checks, {len(failures)} failures")
    sys.exit(1 if failures else 0)
