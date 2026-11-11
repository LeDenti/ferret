# Ferret — product

## What it is

Ferret is a decision engine with a mood. It guards a small pool of play money that advances cash on
invoices. Every request passes the same ordered checks — share of capital per debtor, advance rate, term,
liquidity — and returns a yes or a no with a reason. The mood changes how much Ferret lends, never what it
checks.

## The visitor

The visitor plays three roles at once: the supplier who holds the invoice, the debtor who must pay it,
and the lender who funds the pool. They fund the pool, add invoices, repay or let them default, and watch
Ferret decide, explain, and change mood.

## One ferret, three burrows

The engine, the mood and the case file are shared. A use case is a rule pack stacked on the same engine:

1. **Invoices** — in scope now: the pool, concentration and term ceilings, repayment, default, buyback.
2. **Pay by evidence** — planned: a bonus paid only when required proofs are present.
3. **Conditional escrow** — planned: a release signed only when date and fingerprint agree.

Only burrow 1 ships for Kiroween 2026. The other two are named so the architecture is not remade later.

## Tone of the screen

A field log, sober Halloween. The journal reads like a quiet observer noting what happened and how the
ferret reacted — plain language, dated ticks, no dashboards or hype. Mood has a label (`calm`, `wary`,
`feral`) and a reason, never a number the visitor must decode.

## Honest limits

Play money only. The pool is a book, not a bank: no custody, no wallet, no lending licence. The mood is a
model, not a claim about ferrets or worms. Nothing here is financial advice.
