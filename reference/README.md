# `reference/`: the judge, not the product

Nothing in this folder ships. It exists so that the engine built in Kiro can be checked against an
independent implementation on thousands of random cases.

- `python/ferret/mood.py`: the sentiment layer, transposed from XRPLife (4 Nov 2026).
- `python/ferret/invoices.py`: burrow 1, the invoice-advance pool; rules carried over from dareskro's risk
  policy (1 Nov 2026) and Solana program (5 Nov 2026), reduced to one deterministic seat.
- `generate_cases.py` → `cases.json`: random policies, random event sequences, expected outcomes.
- `replay_cases.py`: checks the oracle against its own file (the Python side of the differential test).
- `CASES.md`: the contract, check by check.

Python 3.10+, standard library only. `python3 -I generate_cases.py && python3 -I replay_cases.py`.

Written with Claude Code on 11 November 2026, inside the hackathon period, and disclosed as such in the root README.

- `mcp_oracle.py`: a minimal MCP server (stdio, standard library) exposing `replay_events`, so that Kiro can ask the
  judge what must happen on a given sequence of events while it builds. Declared in `.kiro/settings/mcp.json`.
