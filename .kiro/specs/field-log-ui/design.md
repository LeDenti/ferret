# Field-log UI — design

## Where it lives

`src/web/index.html`, `src/web/app.css`, `src/web/app.js`. No framework, no
build step, no external resources. The server serves these three files
(REQ-SRV-03).

## DOM structure

```html
<body>
  <main id="app">
    <section id="ferret">           <!-- left -->
      <h2>The ferret</h2>
      <svg id="ferret-svg">…</svg>   <!-- inline SVG, three posture groups -->
      <p id="mood-word">calm</p>
      <p id="ceilings"></p>           <!-- "will lend up to X% … no longer than N days" -->
    </section>
    <section id="book">              <!-- centre -->
      <h2>The book</h2>
      <dl id="totals">
        <dt>capital</dt><dd id="t-capital"></dd>
        <dt>cash on hand</dt><dd id="t-cash"></dd>
        <dt>outstanding</dt><dd id="t-outstanding"></dd>
        <dt>losses</dt><dd id="t-losses"></dd>
        <dt>fees</dt><dd id="t-fees"></dd>
      </dl>
      <table id="debtors"><tr><th>debtor</th><th>exposure</th></tr></table>
      <table id="advances"><tr><th>invoice</th><th>status</th><th>repaid</th></tr></table>
    </section>
    <section id="log">              <!-- right -->
      <h2>The field log</h2>
      <ol id="journal"></ol>          <!-- newest first -->
    </section>
  </main>
  <nav id="controls"><!-- buttons + selects, fixed choices --></nav>
  <div id="banner" hidden></div>      <!-- refusal banner, fades in 5 s -->
</body>
```

Controls use `<button>` and `<select>` with fixed options. "Add invoice"
reveals a small form with `<select>` for debtor, face, advance rate, term, and
analysis. Repay / default / buyback / withdraw each populate a `<select>` from
the current snapshot (advance ids or lender names), repopulated each render.

## State flow

```
on load      → GET /api/state → render(state)
on control   → POST /api/event | /api/tick | /api/reset → GET /api/state → render(state)
```

`render(state)` wipes and rebuilds the three sections from `state.snapshot`,
`state.journal`, and `state.tick`. No state is kept beyond the last response
(REQ-UI-08).

## Family → sentence dictionary (all 18)

| family | sentence |
|--------|---------|
| `zero_amount` | the amount was zero or less |
| `below_minimum` | the face was below the minimum |
| `duplicate_invoice` | that invoice is already in the book |
| `analysis_required` | no analysis was on file |
| `advance_above_face` | the advance exceeded the face |
| `fee_above_face` | the fee did not fit under the face |
| `due_passed` | the due date had already passed |
| `term_too_long` | the term ran past the ceiling |
| `advance_above_cap` | the advance rate was above the cap |
| `concentration_breached` | one debtor held too much of the pool |
| `debtor_cap_breached` | the debtor had hit its absolute cap |
| `pool_illiquid` | the pool did not have the cash |
| `not_a_lender` | that name is not a lender |
| `unknown_invoice` | no such invoice in the book |
| `not_funded` | that advance is not funded |
| `default_too_early` | the grace period had not run out |
| `not_defaulted` | that advance has not defaulted |
| `unknown_op` | the ferret did not know that operation |

Journal entry format: `Day {t} — {op} accepted.` or `Day {t} — {op} refused:
{family sentence}.` A mood change is marked with `→ {mood}` appended.

## Ferret SVG states

One inline `<svg id="ferret-svg">` with three `<g>` posture groups:

- **calm** — sitting upright, tail curled, eyes half-closed.
- **wary** — crouched low, eyes wide, tail straight.
- **feral** — arched back, fur bristled, teeth showing.

The SVG gets `class="{mood}"`; CSS shows the matching `<g>` (`display: block`)
and hides the others (`display: none`), with a 200 ms opacity cross-fade
(disabled by `prefers-reduced-motion`).

## CSS variables

```css
:root {
  --bg: #1a1a2e;        /* dark background */
  --panel: #16213e;     /* dark panel */
  --accent: #e8731c;    /* pumpkin */
  --accent-dim: #b85a14;
  --bone: #e8e0d0;      /* bone text */
  --bone-dim: #a09888;
  --good: #6a8d3b;      /* calm */
  --warn: #d4a017;      /* wary */
  --danger: #c0392b;    /* feral */
  --line: #2a2a4e;
  --focus: #e8731c;     /* focus ring = accent */
}
```

Dark background, pumpkin accent, bone-coloured text. All text meets WCAG AA
contrast against `--bg` (4.5:1 minimum). Layout is CSS grid; at 360 px a
media query switches to a single column (ferret → book → log).

## Correctness properties

1. **Every rendered number is a snapshot field**, except `cash_on_hand` =
   `capital − outstanding` (two snapshot fields). No other arithmetic in
   `app.js` (REQ-UI-13).
2. **No rule logic in the client** — the screen never checks a ceiling, scales
   a value, or computes a decision. It only POSTs and renders.
3. **No local accumulation** — the page holds only the last `/api/state`
   response. Reload yields the same screen (REQ-UI-08).
4. **Refusals are visible, not modal** — a refusal appears in the log and as a
   fading banner, never as `alert()` (REQ-UI-09).
5. **Mood drives only the SVG and the word** — the posture and label come
   from `snapshot.mood`; the ceilings come from `snapshot.effective`. The
   client never computes a scale or a label.

---

The screen is a window: it shows what the server says, nothing more.
