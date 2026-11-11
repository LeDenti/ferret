# Ferret

*It ferrets out the invoice that would eat the pool.*

A decision engine with a mood. Ferret guards a small pool of money that advances cash on invoices.
Every request goes through the same ordered checks (share of the capital per debtor, advance rate, term,
liquidity) and gets a yes or a no with a reason. Ferret also has a **mood**: when a debtor pushes past a
ceiling, or an advance defaults, it gets wary, then feral, and its ceilings tighten; when advances are repaid,
it calms down; with time, it forgets. The mood changes how much Ferret lends, never what it checks.

Built for [Kiroween 2026](https://kiroween.devpost.com), category **Frankenstein**: a financial rule book
stitched to the sentiment layer of a one-millimetre worm.

## Try it

**https://ferret-amw8.onrender.com** (free tier: the first load after an idle period takes up to a minute). Nothing real: play money, no wallet, no sign-up.

The visitor plays the supplier, the debtor and the lender at once: fund the pool, add invoices, repay or
not, and watch Ferret decide, explain, and change mood. The journal is written like a field log.

## How it was built, in Kiro

Everything under `src/`, `tests/` and `.kiro/` was produced by **Kiro CLI 3.2.0** (`kiro-cli chat`), non-interactive,
with read and write tools only, in this order. The commit history is the log.

1. **Steering** (`.kiro/steering/`): product, tech, structure. Three non-negotiables came from here and held all the
   way: integer arithmetic only, zero runtime dependencies, `reference/` is read-only.
2. **Spec `mood`**: 11 EARS requirements, a design with the TypeScript interface, an overflow analysis and 9
   correctness properties, a task list. Then the module and 18 tests, all green on the first run.
3. **Spec `invoice-pool`**: 14 requirements including the twelve checks in their exact order, a design, tasks.
   Then `src/engine/invoices.ts` in one pass, and the differential test: Kiro's engine replayed the 4 926 oracle
   steps (120 scenarios) with **zero mismatch on the first run**. The four unit tests that failed were Kiro's own
   expectations being wrong (they forgot the mood moves on a ceiling refusal); the engine was right, the oracle
   settled it.
4. **Spec `server`** and the demo server: `node:http`, one pool per visitor, validation, rate limit; checked
   endpoint by endpoint with curl.
5. **Spec `field-log-ui`** and the screen.
6. **Hooks, agent, MCP** (`.kiro/hooks/`, `.kiro/agents/immunologist.md`, `.kiro/settings/mcp.json`): tests on
   every engine edit, a guard that reverts any change under `reference/`, a reviewer that checks the three rules
   that matter, and the oracle itself exposed as an MCP tool (`replay_events`) so Kiro can ask the judge instead of
   guessing.

**Spec mode versus vibe mode.** The engine was spec-first; the screen was closer to a conversation. The spec cost
more credits per file and paid for itself the moment the differential test ran: every requirement was already a
test, every property already a property test, and a disagreement between two implementations was settled by one
command rather than a debate.

**What did not work, honestly.** On the free plan Kiro CLI throttles for about fifteen minutes after a burst of
large reads, and in non-interactive mode it drafts files in the chat unless told in so many words to write them to
disk. The fixes were small prompts, short read lists, one spec at a time, and never letting the agent open the
4 MB case file.

**Who typed.** The developer did not drive Kiro by hand: on their instruction, an AI assistant (Claude Code) wrote
the prompts to Kiro CLI, ran the tests between calls and committed the results. Kiro produced the code; the oracle
judged it; the developer decided the scope, the name, the rules and what to disclose.

## One ferret, three burrows

The engine, the mood and the case file are shared. A use case is a rule pack:

1. **Invoices** (this submission): the pool, concentration and term ceilings, repayment, default, buyback.
2. **Pay by evidence** (planned): a bonus is computed only when the required proofs are present.
3. **Conditional escrow** (planned): a release is signed only when date and fingerprint agree.

## Prior work, disclosed

The idea of a rule engine with ceilings comes from our own earlier prototypes of an invoice-advance pool
(1 and 5 November 2026, inside the submission period, in another repository under this account); none
of their code is included. The Python reference oracle in `reference/` was written on 11 November 2026
with a different AI assistant (Claude Code) and is used only as a test judge; the small MCP server that exposes it (`reference/mcp_oracle.py`) is part of that judge side. The mood model is a
transposition of a measurement from our research project XRPLife (the sentiment layer of *C. elegans* on
the XRP Ledger, 4 November 2026), cited as inspiration; none of its code is included. Everything under
`src/`, `tests/` and `.kiro/`, the web app, the hooks and the MCP configuration were built in Kiro from the specs.

## Honest limits

Play money only. The pool is a book, not a bank: no custody, no ledger, no lending licence. The mood is a
model, not a claim about ferrets or worms. Integer arithmetic throughout; the two engines agree to the unit.

## Licence

MIT. See `LICENSE`.
