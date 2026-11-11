# Field-log UI — tasks

Ordered checklist. Each task references the requirement(s) it fulfils.

## 1. Page skeleton — REQ-UI-01, 02

- [ ] Create `src/web/index.html` with three `<section>` regions (ferret,
      book, log), a `<nav id="controls">`, and a `<div id="banner" hidden>`.
- [ ] Link `app.css` and `app.js`; no external resources (REQ-UI-01).

## 2. CSS palette and layout — REQ-UI-02, 10, 11

- [ ] Create `src/web/app.css` with the CSS variables (dark, pumpkin, bone).
- [ ] Three-column grid layout; at 360 px stack vertically (REQ-UI-11).
- [ ] Visible focus ring (`--focus`), AA contrast, transitions ≤ 200 ms
      (REQ-UI-10).
- [ ] `@media (prefers-reduced-motion: reduce)` disables all transitions
      (REQ-UI-10).

## 3. Ferret SVG — REQ-UI-03

- [ ] Inline `<svg id="ferret-svg">` with three `<g>` groups (calm, wary,
      feral).
- [ ] CSS shows the group matching `snapshot.mood`, hides the others, with a
      ≤ 200 ms opacity cross-fade.

## 4. State flow — REQ-UI-07, 08

- [ ] `app.js`: on load, `GET /api/state` → `render(state)`.
- [ ] On control activation: one `POST` (`/api/event`, `/api/tick`, or
      `/api/reset`) → `GET /api/state` → `render(state)` (REQ-UI-07).
- [ ] No state kept beyond the last response (REQ-UI-08).

## 5. Render the ferret — REQ-UI-03

- [ ] `renderFerret(snap)`: set `#mood-word` to `snap.mood`; set `#ferret-svg`
      class to `snap.mood`; set `#ceilings` text from
      `snap.effective.share_bps` and `snap.effective.max_term`.

## 6. Render the book — REQ-UI-04, 13

- [ ] `renderBook(snap)`: fill totals from snapshot fields; `cash_on_hand` =
      `snap.capital − snap.outstanding` (the only derived value, REQ-UI-13).
- [ ] Build debtor rows from `snap.exposures` (sorted keys).
- [ ] Build advance rows from `snap.advances` (sorted keys, `{status, repaid}`).

## 7. Render the field log — REQ-UI-05

- [ ] `renderLog(journal)`: reverse to newest first; build one `<li>` per
      entry as one sentence: `Day {t} — {op} {accepted|refused}: {sentence}.`
- [ ] Refused entries: look up the family in the 18-entry dictionary.
- [ ] Mood changes: append `→ {mood}` when the entry's mood differs from the
      previous entry's.

## 8. Controls — REQ-UI-06

- [ ] Fund: three buttons (1000 / 5000 / 20000) → POST `deposit`.
- [ ] Add invoice: a form with `<select>` for debtor (D1..D4), face (from a
      list), advance rate (80 / 90 / 100), term (7 / 30 / 90 / 120), analysis
      (yes / no) → POST `advance`.
- [ ] Repay: `<select>` of funded advances; full / half / plus surplus → POST
      `repay`.
- [ ] Default: `<select>` of funded advances → POST `default`.
- [ ] Buyback: `<select>` of defaulted advances → POST `buyback`.
- [ ] Withdraw: `<select>` of lenders → POST `withdraw`.
- [ ] Next day / +7 / +30: three buttons → POST `/api/tick` with 1 / 7 / 30.
- [ ] Reset: one button → POST `/api/reset`.
- [ ] Repay / default / buyback / withdraw selects repopulated from the
      snapshot each render.

## 9. Refusal banner — REQ-UI-09

- [ ] On a `refuse` decision, show `#banner` with the family sentence; hide
      after 5 s via CSS transition.
- [ ] Never use `alert()`, `confirm()`, or `prompt()`.

## 10. Accessibility pass — REQ-UI-10

- [ ] Tab through every control; verify visible focus.
- [ ] Check contrast ratios against `--bg` (AA minimum 4.5:1 for text).
- [ ] Verify `prefers-reduced-motion: reduce` kills all transitions.
- [ ] Verify no transition exceeds 200 ms.

## 11. Responsive pass — REQ-UI-11

- [ ] At 360 px: columns stack, no horizontal scroll, order ferret → book →
      log.

## 12. No-tracking audit — REQ-UI-12

- [ ] Grep `app.js`: no `document.cookie`, no `localStorage`, no
      `sessionStorage`, no third-party URLs.

## 13. Correctness audit — REQ-UI-13

- [ ] Grep `app.js`: no arithmetic on money or mood values except
      `capital − outstanding` for `cash_on_hand`.
- [ ] Confirm every rendered number traces to a snapshot field.

---

Three static files, one window: the server decides, the screen shows.
