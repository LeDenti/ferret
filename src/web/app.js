'use strict';

// 18 refusal families → plain sentences (from design.md)
const FAMILY = {
  zero_amount: 'the amount was zero or less',
  below_minimum: 'the face was below the minimum',
  duplicate_invoice: 'that invoice is already in the book',
  analysis_required: 'no analysis was on file',
  advance_above_face: 'the advance exceeded the face',
  fee_above_face: 'the fee did not fit under the face',
  due_passed: 'the due date had already passed',
  term_too_long: 'the term ran past the ceiling',
  advance_above_cap: 'the advance rate was above the cap',
  concentration_breached: 'one debtor held too much of the pool',
  debtor_cap_breached: 'the debtor had hit its absolute cap',
  pool_illiquid: 'the pool did not have the cash',
  not_a_lender: 'that name is not a lender',
  unknown_invoice: 'no such invoice in the book',
  not_funded: 'that advance is not funded',
  default_too_early: 'the grace period had not run out',
  not_defaulted: 'that advance has not defaulted',
  unknown_op: 'the ferret did not know that operation'
};

let state = null;       // last /api/state response
let bannerTimer = null;

// ── DOM helpers ──────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function opt(text, value) {
  const o = document.createElement('option');
  o.textContent = text;
  o.value = value;
  return o;
}

function row(cells) {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const td = document.createElement('td');
    td.textContent = c;
    tr.appendChild(td);
  }
  return tr;
}

// ── API ──────────────────────────────────────────────────────
async function post(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}

async function getState() {
  const r = await fetch('/api/state', { credentials: 'same-origin' });
  return r.json();
}

// ── derived helpers ──────────────────────────────────────────
function funded(snap) {
  return Object.entries(snap.advances).filter(([, v]) => v.status === 'funded');
}

function defaulted(snap) {
  return Object.entries(snap.advances).filter(([, v]) => v.status === 'defaulted');
}

function nextInvoiceId(snap) {
  let n = 0;
  for (const k of Object.keys(snap.advances)) {
    const m = k.match(/^INV-(\d+)$/);
    if (m) n = Math.max(n, +m[1]);
  }
  return 'INV-' + (n + 1);
}

// owed = advance + fee, looked up from the matching 'advance' journal entry
function findOwed(invoice) {
  for (const e of state.journal) {
    if (e.op === 'advance' && e.invoice === invoice) return e.advance + e.fee;
  }
  return null;
}

// ── render ───────────────────────────────────────────────────
function render() {
  const snap = state.snapshot;
  const mood = snap.mood;

  // Ferret mood + class
  $('app').className = mood;
  $('ferret-svg').setAttribute('class', mood);
  $('mood-word').textContent = mood;
  $('ceilings').textContent =
    'will lend up to ' + (snap.effective.share_bps / 100) +
    ' % to one debtor; no longer than ' + snap.effective.max_term + ' days';

  // Book totals (cash on hand = capital − outstanding, the one derived display)
  $('t-capital').textContent = snap.capital;
  $('t-cash').textContent = snap.capital - snap.outstanding;
  $('t-outstanding').textContent = snap.outstanding;
  $('t-losses').textContent = snap.losses;
  $('t-fees').textContent = snap.fees_earned;

  // Debtors table from exposures
  const dt = $('debtors').querySelector('tbody');
  clear(dt);
  for (const [d, owed] of Object.entries(snap.exposures)) {
    dt.appendChild(row([d, owed]));
  }

  // Advances table
  const at = $('advances').querySelector('tbody');
  clear(at);
  for (const [inv, v] of Object.entries(snap.advances)) {
    at.appendChild(row([inv, v.status, v.repaid]));
  }

  // Journal — newest first, one sentence per entry
  const log = $('journal');
  clear(log);
  const entries = [...state.journal].reverse();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    let text = 'Day ' + e.t + ' — ' + e.op;
    if (e.decision === 'ok') text += ' accepted.';
    else text += ' refused: ' + (FAMILY[e.family] || e.family) + '.';
    // mood arrow when mood changed vs the chronologically previous entry
    if (i < entries.length - 1 && e.mood !== entries[i + 1].mood) {
      text += ' → ' + e.mood;
    }
    const li = document.createElement('li');
    li.textContent = text;
    log.appendChild(li);
  }

  populateSelects(snap);
}

function populateSelects(snap) {
  // Repay & default: funded advances
  const f = funded(snap);
  for (const id of ['repay-advance', 'default-advance']) {
    const sel = $(id);
    const prev = sel.value;
    clear(sel);
    sel.appendChild(opt('— pick invoice —', ''));
    for (const [inv] of f) sel.appendChild(opt(inv, inv));
    sel.value = [...sel.options].some(o => o.value === prev) ? prev : '';
  }
  // Buyback: defaulted advances
  const d = defaulted(snap);
  const bs = $('buyback-advance');
  const bprev = bs.value;
  clear(bs);
  bs.appendChild(opt('— pick invoice —', ''));
  for (const [inv] of d) bs.appendChild(opt(inv, inv));
  bs.value = [...bs.options].some(o => o.value === bprev) ? bprev : '';
  // Withdraw: lenders
  const ws = $('withdraw-lender');
  const wprev = ws.value;
  clear(ws);
  ws.appendChild(opt('— pick lender —', ''));
  for (const name of Object.keys(snap.lenders)) ws.appendChild(opt(name, name));
  ws.value = [...ws.options].some(o => o.value === wprev) ? wprev : '';
}

// ── refusal banner ───────────────────────────────────────────
function showBanner(text) {
  const b = $('banner');
  b.textContent = text;
  b.hidden = false;
  b.className = 'show';
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    b.className = '';
    b.hidden = true;
  }, 4000);
}

// ── actions ───────────────────────────────────────────────────
async function doEvent(op, args) {
  const r = await post('/api/event', { op, args });
  if (r.error) {
    showBanner(r.error);
  } else if (r.decision && r.decision.decision === 'refuse') {
    showBanner(FAMILY[r.decision.family] || r.decision.family);
  }
  if (r.snapshot) {
    state.snapshot = r.snapshot;
    if (r.entry) {
      state.journal = [...state.journal, r.entry];
      if (state.journal.length > 50) state.journal = state.journal.slice(1);
    }
    render();
  }
}

async function doTick(days) {
  await post('/api/tick', { days });
  state = await getState();
  render();
}

async function doReset() {
  await post('/api/reset', {});
  state = await getState();
  render();
}

// ── controls ─────────────────────────────────────────────────
function setupControls() {
  // Fund
  $('fund-btn').addEventListener('click', () => {
    doEvent('deposit', { lender: 'L1', amount: +$('fund-amount').value });
  });

  // Add invoice
  $('inv-btn').addEventListener('click', () => {
    const face = +$('inv-face').value;
    const rate = +$('inv-rate').value;
    const term = +$('inv-term').value;
    doEvent('advance', {
      invoice: nextInvoiceId(state.snapshot),
      supplier: 'S1',
      debtor: $('inv-debtor').value,
      face: face,
      advance: Math.floor(face * rate / 100),
      fee: Math.floor(face * 2 / 100),
      due: state.tick + term,
      analysis: $('inv-analysis').value === 'yes'
    });
  });

  // Repay
  $('repay-btn').addEventListener('click', () => {
    const inv = $('repay-advance').value;
    if (!inv) return;
    const mode = $('repay-mode').value;
    let owed = findOwed(inv);
    if (owed === null) owed = 1e9;
    let amount;
    if (mode === 'full') amount = owed;
    else if (mode === 'half') amount = Math.floor(owed / 2);
    else amount = owed + 100;
    doEvent('repay', { invoice: inv, amount });
  });

  // Default
  $('default-btn').addEventListener('click', () => {
    const inv = $('default-advance').value;
    if (inv) doEvent('default', { invoice: inv });
  });

  // Buyback
  $('buyback-btn').addEventListener('click', () => {
    const inv = $('buyback-advance').value;
    if (inv) doEvent('buyback', { invoice: inv });
  });

  // Withdraw
  $('withdraw-btn').addEventListener('click', () => {
    const lender = $('withdraw-lender').value;
    if (!lender) return;
    doEvent('withdraw', { lender });
  });

  // Tick buttons
  $('tick-1').addEventListener('click', () => doTick(1));
  $('tick-7').addEventListener('click', () => doTick(7));
  $('tick-30').addEventListener('click', () => doTick(30));

  // Reset
  $('reset-btn').addEventListener('click', doReset);
}

// ── init ──────────────────────────────────────────────────────
async function init() {
  state = await getState();
  setupControls();
  render();
}

init();
