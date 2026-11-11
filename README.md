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

*(URL of the running app, added at submission. Nothing real: play money, no wallet, no sign-up.)*

The visitor plays the supplier, the debtor and the lender at once: fund the pool, add invoices, repay or
not, and watch Ferret decide, explain, and change mood. The journal is written like a field log.

## How it was built, in Kiro

*(Filled from the actual history: specs, steering, hooks, MCP, the agent; what spec-mode gave versus vibe-mode.)*

Spec first. Every rule of the pool is one EARS requirement in `.kiro/specs/`; Kiro derived the design, the
tasks, the properties, and the engine in `src/`. Then the differential test: a Python reference written
independently throws thousands of random events at both engines and compares every decision and every
balance (`reference/CASES.md`).

## One ferret, three burrows

The engine, the mood and the case file are shared. A use case is a rule pack:

1. **Invoices** (this submission): the pool, concentration and term ceilings, repayment, default, buyback.
2. **Pay by evidence** (planned): a bonus is computed only when the required proofs are present.
3. **Conditional escrow** (planned): a release is signed only when date and fingerprint agree.

## Prior work, disclosed

The idea of a rule engine with ceilings comes from our own earlier prototypes of an invoice-advance pool
(1 and 5 November 2026, inside the submission period, in another repository under this account); none
of their code is included. The Python reference oracle in `reference/` was written on 11 November 2026
with a different AI assistant (Claude Code) and is used only as a test judge. The mood model is a
transposition of a measurement from our research project XRPLife (the sentiment layer of *C. elegans* on
the XRP Ledger, 4 November 2026), cited as inspiration; none of its code is included. Everything under
`src/`, `tools/` and `.kiro/`, the web app and the hooks were built in Kiro from the specs.

## Honest limits

Play money only. The pool is a book, not a bank: no custody, no ledger, no lending licence. The mood is a
model, not a claim about ferrets or worms. Integer arithmetic throughout; the two engines agree to the unit.

## Licence

MIT. See `LICENSE`.
