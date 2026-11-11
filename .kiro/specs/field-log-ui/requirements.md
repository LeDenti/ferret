# Field-log UI — requirements

## What this is

One static page — `src/web/index.html`, `app.css`, `app.js` — no framework, no
build step, no external resources. It works offline against the server's JSON
API. The visitor plays supplier, debtor, and lender: fund the pool, add
invoices, repay or default, and watch Ferret decide, explain, and change mood.
The screen never computes money or rules; it only renders the server snapshot.

---

## REQ-UI-01 — Static page, no framework, no build

WHEN the browser loads `/` THE SYSTEM SHALL serve one HTML page linking
`app.css` and `app.js` from the same origin, with no framework, no build step,
and no external resources (no CDN, no web fonts, no images beyond inline SVG).
Acceptance: the page works offline except for API calls; view-source shows no
external `src` or `href` attributes.

## REQ-UI-02 — Three-column layout

WHEN the page renders THE SYSTEM SHALL lay out three columns: left "the
ferret", centre "the book", right "the field log". Acceptance: three labelled
regions are present; reading order is ferret, book, log.

## REQ-UI-03 — Left: the ferret

WHEN the snapshot arrives THE SYSTEM SHALL show the mood as a word (`calm`,
`wary`, `feral`), a small inline-SVG ferret whose posture changes with the mood,
and the two effective ceilings: "will lend up to X % to one debtor" (from
`effective.share_bps`) and "no longer than N days" (from `effective.max_term`).
Acceptance: the word matches `snapshot.mood`; the SVG posture corresponds;
both ceilings show the numbers from `snapshot.effective`.

## REQ-UI-04 — Centre: the book

WHEN the snapshot arrives THE SYSTEM SHALL show `capital`, `cash_on_hand`
(`capital − outstanding`), `outstanding`, `losses`, `fees_earned`, one row per
debtor from `exposures`, and one row per advance from `advances` with its
status. Acceptance: every number equals the corresponding snapshot field
(`cash_on_hand` excepted, being the difference of two fields); debtor rows
match `exposures` keys and values; advance rows match `advances` keys and
`{status, repaid}`.

## REQ-UI-05 — Right: the field log

WHEN the journal arrives THE SYSTEM SHALL render it newest first, each entry
one plain sentence with the tick, the op, the decision, and — if refused — the
family in words via a dictionary. Mood changes shall be marked. Acceptance:
entries appear newest first; each is one sentence; a refused entry names the
family in plain words; a mood change is flagged.

## REQ-UI-06 — Controls, fixed choices only

WHEN the visitor operates a control THE SYSTEM SHALL offer only fixed choices
(no free text except names from short lists): fund (1000 / 5000 / 20000), add
invoice (debtor D1..D4, face from a list, advance rate 80 / 90 / 100 %, due in
7 / 30 / 90 / 120 days, analysis yes / no), repay (pick one; full / half /
plus surplus), default (pick one), buyback (pick one), withdraw (pick a
lender), next day / +7 / +30, reset. Acceptance: every control is a button or
fixed-option `<select>`; no free text beyond names from short lists.

## REQ-UI-07 — One POST, then re-render

WHEN the visitor activates a control THE SYSTEM SHALL send one POST to
`/api/event`, `/api/tick`, or `/api/reset`, then fetch `/api/state` and
re-render the whole page. Acceptance: one request per activation; the page
reflects the new server state after every control.

## REQ-UI-08 — No local state besides last response

WHEN the page runs THE SYSTEM SHALL hold no state beyond the last
`/api/state` response. Acceptance: reloading reproduces the same screen; no
client-side accumulation of decisions or balances.

## REQ-UI-09 — Refusals in log and banner, never alert

WHEN a decision is `refuse` THE SYSTEM SHALL show it in the field log and as a
brief banner that fades within 5 s, and never call `alert()`, `confirm()`, or
`prompt()`. Acceptance: a refusal produces a log entry and a banner; no modal
dialog appears.

## REQ-UI-10 — Accessibility

WHEN the page is used THE SYSTEM SHALL be keyboard reachable, show visible
focus, meet WCAG AA contrast, use no motion beyond a 200 ms transition, and
respect `prefers-reduced-motion`. Acceptance: Tab reaches every control;
focus is visible; no transition exceeds 200 ms; reduced-motion disables all.

## REQ-UI-11 — Responsive at 360 px

WHEN the viewport is 360 px or narrower THE SYSTEM SHALL stack the three
columns vertically without horizontal scroll. Acceptance: at 360 px no
horizontal scrollbar; columns read top to bottom in order.

## REQ-UI-12 — No tracking, no cookies

WHEN the page runs THE SYSTEM SHALL set no cookies, store no local data, and
send no tracking requests; the only cookie is the server's session cookie.
Acceptance: no `document.cookie` writes, no `localStorage` / `sessionStorage`,
no third-party requests in `app.js`.

## REQ-UI-13 — Screen never computes money or rules

WHEN the page renders any number THE SYSTEM SHALL take it from a field of the
last server response. The only derived display value is `cash_on_hand` =
`capital − outstanding`, both snapshot fields. The screen never evaluates a
rule, computes a decision, or applies a mood scale. Acceptance: no arithmetic
in `app.js` beyond that one subtraction; every other number is a direct read.

---

The screen is a window, not a brain: it shows what the server says, nothing more.
