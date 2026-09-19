/* =========================================================================
   Wholesale Store Billing — CORE (pure logic + helpers, no DOM access)
   Everything between the PURE-LOGIC markers is unit-tested in tests/logic.test.mjs
   ========================================================================= */

/* ======== PURE-LOGIC-START ======== */

const CUR = '₹';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(v) {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100;
}
/** Round to nearest paisa then display with Indian grouping */
function money(v, withSymbol = true) {
  const n = round2(v);
  const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + (withSymbol ? CUR : '') + s;
}
function qtyFmt(v) {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : String(round2(n));
}
function pct(v) {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : String(round2(n));
}
function isoDate(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayISO() { return isoDate(new Date()); }
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return String(iso);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return String(iso);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${M[d.getMonth()]}`;
}
function daysBetween(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00'), b = new Date(bISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function monthLabel(iso) {
  const d = new Date(String(iso).slice(0, 7) + '-01T00:00:00');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${M[d.getMonth()]} ${d.getFullYear()}`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function sortByDate(a, b) {
  if (a.date === b.date) return String(a.createdAt || a.no || '').localeCompare(String(b.createdAt || b.no || ''));
  return a.date < b.date ? -1 : 1;
}

/* ---------- Line / invoice math ----------
   Line input: { qty, rate, discPct, gstPct }
   opts: { taxEnabled, priceIncludesTax, roundOff }
   rate = price per selling unit (pcs / box / kg ...) as typed by the shop.
*/
function computeLine(line, opts) {
  const qty = num(line.qty), rate = num(line.rate);
  const discPct = Math.min(100, Math.max(0, num(line.discPct)));
  const gstPct = opts.taxEnabled ? Math.max(0, num(line.gstPct)) : 0;
  const gross = round2(qty * rate);
  const disc = round2(gross * discPct / 100);
  const net = round2(gross - disc);
  let taxable, tax, total;
  if (opts.priceIncludesTax) {
    taxable = gstPct ? round2(net / (1 + gstPct / 100)) : net;
    tax = round2(net - taxable);
    total = net;
  } else {
    taxable = net;
    tax = round2(net * gstPct / 100);
    total = round2(net + tax);
  }
  return { qty, rate, discPct, gstPct, gross, disc, taxable, tax, total };
}

function computeInvoice(lines, disc, opts) {
  const rows = (lines || []).map((l) => {
    const r = computeLine(l, opts);
    r.name = l.name || '';
    r.hsn = l.hsn || '';
    r.unit = l.unit || 'pcs';
    r.productId = l.productId || '';
    r.cost = num(l.cost);
    r.sellUnit = l.sellUnit || l.unit || 'pcs';
    r.ppb = num(l.ppb);
    return r;
  });
  const grossSum = round2(rows.reduce((s, r) => s + r.total, 0));

  const type = disc && disc.type ? disc.type : 'none';
  const val = num(disc && disc.value);
  let billDisc = type === 'pct' ? round2(grossSum * Math.min(100, Math.max(0, val)) / 100)
    : type === 'amt' ? round2(Math.max(0, val)) : 0;
  billDisc = round2(Math.min(billDisc, grossSum));

  // distribute the bill discount proportionally across lines (runding-safe)
  let allocated = 0;
  rows.forEach((r, i) => {
    let share;
    if (!rows.length) share = 0;
    else if (i === rows.length - 1) share = round2(billDisc - allocated);
    else share = grossSum ? round2(billDisc * r.total / grossSum) : 0;
    allocated = round2(allocated + share);
    if (share > r.total) share = r.total;
    r.billDiscShare = share;
    const finalTotal = round2(r.total - share);
    if (opts.priceIncludesTax) {
      r.taxable = r.gstPct ? round2(finalTotal / (1 + r.gstPct / 100)) : finalTotal;
      r.tax = round2(finalTotal - r.taxable);
    } else {
      const factor = r.total ? finalTotal / r.total : 1;
      r.taxable = round2(r.taxable * factor);
      r.tax = round2(finalTotal - r.taxable);
    }
    r.total = finalTotal;
  });

  const totals = {
    gross: grossSum,
    itemDiscount: round2(rows.reduce((s, r) => s + r.disc, 0)),
    billDiscount: billDisc,
    subtotal: round2(rows.reduce((s, r) => s + r.taxable, 0)),
    tax: round2(rows.reduce((s, r) => s + r.tax, 0)),
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
    qty: round2(rows.reduce((s, r) => s + r.qty, 0)),
  };
  totals.roundOff = 0;
  totals.grand = totals.total;
  if (opts.roundOff && rows.length) {
    totals.grand = Math.round(totals.total);
    totals.roundOff = round2(totals.grand - totals.total);
  }
  const byRate = {};
  rows.forEach((r) => {
    const k = String(r.gstPct);
    byRate[k] = byRate[k] || { rate: r.gstPct, taxable: 0, tax: 0 };
    byRate[k].taxable = round2(byRate[k].taxable + r.taxable);
    byRate[k].tax = round2(byRate[k].tax + r.tax);
  });
  totals.taxBreakup = Object.values(byRate).filter((x) => x.rate > 0).sort((a, b) => a.rate - b.rate);
  totals.cost = round2(rows.reduce((s, r) => s + num(r.cost) * num(r.qty), 0));
  return { rows, totals };
}

/* ---------- Khata / ledger ---------- */

/** Simple running-balance statement rows for one customer */
function buildLedger(customer, invoices, payments) {
  const rows = [];
  const opening = round2(num(customer && customer.openingBalance));
  if (opening) rows.push({ date: customer.openingDate || '2000-01-01', type: 'opening', label: 'Opening balance', debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0 });
  (invoices || []).filter((i) => i.customerId === customer.id).sort(sortByDate).forEach((inv) => {
    rows.push({
      date: inv.date, type: 'invoice', refId: inv.id, label: 'Bill ' + inv.no,
      sub: num(inv.paidAtSale) > 0 ? `Paid at bill: ${money(inv.paidAtSale)}` : '',
      debit: round2(inv.total), credit: round2(num(inv.paidAtSale)),
    });
  });
  (payments || []).filter((p) => p.customerId === customer.id).sort(sortByDate).forEach((p) => {
    rows.push({
      date: p.date, type: 'payment', refId: p.id,
      label: 'Payment received' + (p.mode ? ' · ' + p.mode : ''),
      sub: p.note || '', credit: round2(num(p.amount)),
    });
  });
  rows.sort(sortByDate);
  let bal = 0;
  rows.forEach((r) => { bal = round2(bal + num(r.debit) - num(r.credit)); r.balance = bal; });
  const debit = round2(rows.reduce((s, r) => s + num(r.debit), 0));
  const credit = round2(rows.reduce((s, r) => s + num(r.credit), 0));
  return { rows, balance: round2(debit - credit), debit, credit };
}

/** Total receivable for a customer (fast path, no allocation) */
function customerBalance(customer, invoices, payments) {
  let bal = round2(num(customer && customer.openingBalance));
  (invoices || []).forEach((i) => { if (i.customerId === customer.id) bal = round2(bal + num(i.total) - num(i.paidAtSale)); });
  (payments || []).forEach((p) => { if (p.customerId === customer.id) bal = round2(bal - num(p.amount)); });
  return bal;
}

/**
 * Which bill is still pending? Distribute payments FIFO (oldest bill first),
 * honouring payments that were explicitly linked to a bill.
 * Returns { byInvoice: {id:{due,paid,status}}, totalDue, advance }
 */
function allocatePayments(invoices, payments) {
  const invs = (invoices || []).slice().sort(sortByDate);
  const due = new Map();
  invs.forEach((i) => due.set(i.id, round2(num(i.total) - num(i.paidAtSale))));
  const queue = [];
  (payments || []).slice().sort(sortByDate).forEach((p) => {
    let amt = round2(num(p.amount));
    if (amt <= 0) return;
    if (p.invoiceId && due.has(p.invoiceId)) {
      const d = due.get(p.invoiceId);
      const use = Math.min(d, amt);
      due.set(p.invoiceId, round2(d - use));
      amt = round2(amt - use);
      if (amt <= 0) return;
    }
    queue.push({ id: p.id, amount: amt });
  });
  let qi = 0;
  invs.forEach((inv) => {
    let d = due.get(inv.id);
    while (d > 0.004 && qi < queue.length) {
      const q = queue[qi];
      const use = Math.min(d, q.amount);
      d = round2(d - use);
      q.amount = round2(q.amount - use);
      due.set(inv.id, d);
      if (q.amount <= 0.004) qi++;
    }
  });
  const advance = round2(queue.slice(qi).reduce((s, q) => s + num(q.amount), 0));
  const byInvoice = {};
  let totalDue = 0;
  invs.forEach((inv) => {
    const d = round2(Math.max(0, due.get(inv.id)));
    const unbilled = round2(num(inv.total) - num(inv.paidAtSale)); // left open when the bill was made
    const paidLater = round2(unbilled - d);
    const paidTotal = round2(num(inv.paidAtSale) + paidLater);
    totalDue = round2(totalDue + d);
    byInvoice[inv.id] = {
      due: d, paid: paidLater, paidAtSale: num(inv.paidAtSale), paidTotal,
      status: d <= 0.004 ? 'paid' : (paidTotal <= 0.004 ? 'unpaid' : 'partial'),
      ageDays: daysBetween(inv.date, todayISO())
    };
  });
  return { byInvoice, totalDue, advance };
}

/** Aging buckets across all open bills */
function agingBuckets(invoices, payments) {
  const alloc = allocatePayments(invoices, payments);
  const b = { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 };
  Object.keys(alloc.byInvoice).forEach((id) => {
    const a = alloc.byInvoice[id];
    if (a.due <= 0.004) return;
    const age = a.ageDays;
    if (age <= 15) b['0-15'] += a.due; else if (age <= 30) b['16-30'] += a.due; else if (age <= 60) b['31-60'] += a.due; else b['60+'] += a.due;
  });
  Object.keys(b).forEach((k) => { b[k] = round2(b[k]); });
  return b;
}

/* ---------- Stock ---------- */

function isLowStock(p) {
  const t = num(p.lowStock);
  return t > 0 && num(p.stock) <= t;
}
/** base-unit qty consumed by a bill line (box line -> qty * piecesPerBox) */
function baseQty(lineQty, sellUnit, baseUnit, ppb) {
  const q = num(lineQty);
  if (sellUnit && baseUnit && sellUnit === 'box' && num(ppb) > 0) return round2(q * num(ppb));
  return round2(q);
}
/** pretty stock string, e.g. "3 box + 5 pcs" when a box holds 12 */
function packDisplay(stock, ppb, unit) {
  const s = round2(stock);
  if (num(ppb) > 1 && unit !== 'kg' && unit !== 'ltr') {
    const boxes = Math.floor(s / num(ppb));
    const rest = round2(s - boxes * num(ppb));
    if (boxes > 0 && rest > 0) return `${boxes} box + ${qtyFmt(rest)} ${unit}`;
    if (boxes > 0) return `${boxes} box`;
    return `${qtyFmt(s)} ${unit}`;
  }
  return `${qtyFmt(s)} ${unit || ''}`.trim();
}
/** stock value at cost */
function stockValue(products) {
  return round2((products || []).reduce((s, p) => s + num(p.stock) * num(p.cost), 0));
}
/** weighted-average new cost after a purchase */
function avgCost(oldStock, oldCost, inQty, inCost) {
  const os = num(oldStock), oc = num(oldCost), iq = num(inQty), ic = num(inCost);
  const total = os + iq;
  if (total <= 0) return round2(ic);
  if (ic <= 0) return round2(oc);
  return round2(((os > 0 ? os * oc : 0) + iq * ic) / total);
}

/* ---------- Reports ---------- */

function inRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}
function reportRange(state, from, to) {
  const invs = state.invoices.filter((i) => inRange(i.date, from, to));
  const pays = state.payments.filter((p) => inRange(p.date, from, to));
  const moves = (state.moves || []).filter((m) => inRange(m.date, from, to));
  const sales = round2(invs.reduce((s, i) => s + num(i.totals ? i.totals.grand : i.total), 0));
  const tax = round2(invs.reduce((s, i) => s + num(i.totals ? i.totals.tax : i.tax), 0));
  const discount = round2(invs.reduce((s, i) => s + num(i.totals ? i.totals.billDiscount : 0) + num(i.totals ? i.totals.itemDiscount : 0), 0));
  const cost = round2(invs.reduce((s, i) => s + num(i.totals ? i.totals.cost : 0), 0));
  const paidAtSale = round2(invs.reduce((s, i) => s + num(i.paidAtSale), 0));
  const collected = round2(pays.reduce((s, p) => s + num(p.amount), 0));
  const byMode = {};
  pays.forEach((p) => { const m = p.mode || 'Cash'; byMode[m] = round2(num(byMode[m]) + num(p.amount)); });
  const creditGiven = round2(invs.reduce((s, i) => s + num(i.total) - num(i.paidAtSale), 0));
  const purchases = round2(moves.filter((m) => m.type === 'purchase').reduce((s, m) => s + num(m.value), 0));
  const productMap = {};
  invs.forEach((i) => (i.lines || []).forEach((l) => {
    const k = l.productId || l.name;
    productMap[k] = productMap[k] || { name: l.name, qty: 0, amount: 0, unit: l.unit || 'pcs', profit: 0 };
    productMap[k].qty = round2(productMap[k].qty + num(l.qty));
    productMap[k].amount = round2(productMap[k].amount + num(l.total));
    productMap[k].profit = round2(productMap[k].profit + num(l.total) - num(l.cost) * num(l.qty));
  }));
  const topProducts = Object.values(productMap).sort((a, b) => b.amount - a.amount);
  return {
    from, to, invoices: invs.sort(sortByDate).reverse(), payments: pays.sort(sortByDate).reverse(), moves,
    sales, tax, discount, cost, profit: round2(sales - tax - cost), collected, byMode,
    creditGiven, purchases, topProducts, billCount: invs.length,
    itemsSold: round2(invs.reduce((s, i) => s + (i.lines || []).reduce((x, l) => x + num(l.qty), 0), 0)),
  };
}

/* ---------- Customer portal ids ---------- */

/** Login id → the email Firebase Auth uses internally.
 *  "ramesh123"  -> "ramesh123@customers.wholesale-billing.app"
 *  "r@shop.com" -> "r@shop.com" (a real email the owner typed is used as it is) */
function portalEmail(idOrEmail, domain) {
  const v = String(idOrEmail == null ? '' : idOrEmail).trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v;
  const d = String(domain || 'customers.wholesale-billing.app').trim().toLowerCase();
  return v.replace(/[^a-z0-9._-]/g, '') + '@' + d;
}
function portalIdLooksLikeEmail(v) { return String(v || '').includes('@'); }
/** Login id rules: 3–30 chars, letters/numbers/dot/underscore/dash */
function portalIdOk(v) {
  const u = String(v || '').trim();
  return portalIdLooksLikeEmail(u) ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u) : /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(u);
}
/** A readable temporary password the owner can read out over the phone */
function randomPassword(len) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const n = Math.max(6, Math.min(20, len || 8));
  let out = '';
  try {
    const buf = new Uint8Array(n);
    (window.crypto || crypto).getRandomValues(buf);
    for (let i = 0; i < n; i++) out += alphabet[buf[i] % alphabet.length];
  } catch (e) {
    for (let i = 0; i < n; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
/** Login link the shop sends to customers (works for any hosting path) */
function portalLink(base) {
  const b = base || (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  return String(b).split('#')[0] + '#customer';
}

/** Amount in words, Indian system (Lakh / Crore) — used on printed bills */
function amountInWords(amount) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) { return n < 20 ? a[n] : (b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '')); }
  function three(n) { return (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n)); }
  let n = Math.floor(Math.abs(num(amount)));
  const paise = Math.round((Math.abs(num(amount)) - n) * 100);
  if (n === 0 && paise === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(three(crore) + ' Crore');
  if (lakh) parts.push(three(lakh) + ' Lakh');
  if (thousand) parts.push(three(thousand) + ' Thousand');
  if (n) parts.push(three(n));
  let out = parts.join(' ').trim() + ' Rupees';
  if (paise) out += ' and ' + two(paise) + ' Paise';
  return out + ' Only';
}

/** Normalise an Indian/local phone number to international digits for WhatsApp.
 *  "98200 11111" / "09820011111" → "919820011111" (country code from Settings). */
function normPhone(phone, cc) {
  let p = String(phone == null ? '' : phone).replace(/\D/g, '');
  const country = String(cc == null ? '91' : cc).replace(/\D/g, '') || '91';
  if (!p) return '';
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 10) return country + p;                      // plain 10-digit mobile
  if (p.startsWith('0') && p.length === 11) return country + p.slice(1); // 0 + 10 digits
  if (p.length < 10) return country + p.replace(/^0+/, '');     // short number
  return p;                                                    // already has a country code
}

/**
 * Build the WhatsApp URL.
 *  mode   = 'auto' | 'web' | 'app'
 *  mobile = is this a phone? (browser passes isMobileDevice())
 *  auto on a PC     → web.whatsapp.com : opens the chat in the WhatsApp Web tab that
 *                     is already logged in, with the message pre-typed.
 *  auto on a phone  → wa.me : opens the WhatsApp app with the message pre-typed.
 */
function waUrlFor(mode, phone, text, cc, mobile) {
  const p = normPhone(phone, cc);
  const t = encodeURIComponent(text == null ? '' : text);
  const m = !mode || mode === 'auto' ? (mobile ? 'app' : 'web') : mode;
  if (m === 'app') return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`;
  return p ? `https://web.whatsapp.com/send?phone=${p}&text=${t}` : `https://web.whatsapp.com/`;
}

function csv(rows, headers) {
  const head = headers.map((h) => `"${String(h.label).replace(/"/g, '""')}"`).join(',');
  const body = rows.map((r) => headers.map((h) => {
    let v = typeof h.value === 'function' ? h.value(r) : r[h.value];
    if (v == null) v = '';
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
  return head + '\n' + body;
}

/** Unique customer list helpers */
function dueCustomers(customers, invoices, payments) {
  return customers.map((c) => ({ customer: c, balance: customerBalance(c, invoices, payments) }))
    .filter((x) => Math.abs(x.balance) > 0.004)
    .sort((a, b) => b.balance - a.balance);
}

/* ======== PURE-LOGIC-END ======== */

/* ---------- non-pure helpers (DOM / browser only) ---------- */
function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function download(filename, text, mime = 'text/plain;charset=utf-8') {
  try {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return true;
  } catch (e) { return false; }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      return true;
    } catch (e2) { return false; }
  }
}
/* ---------- password hashing (local mode only; Firebase Auth handles the cloud) ---------- */
function newSalt() {
  try {
    const b = new Uint8Array(12);
    (window.crypto || crypto).getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { return String(Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); }
}
async function hashPassword(password, salt) {
  const data = String(salt) + '|' + String(password);
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return 'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { }
  let h = 5381;                       // fallback for file:// (no WebCrypto in insecure contexts)
  for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data.charCodeAt(i)) >>> 0;
  return 'djb2:' + h.toString(16);
}
async function verifyPassword(password, salt, hash) {
  return (await hashPassword(password, salt)) === hash;
}

/* ---------- WhatsApp opening (browser) ---------- */
function isMobileDevice() {
  // Trust an explicit "yes" from either modern client hints or the UA string:
  // headless/spoofed UAs and a few in-app browsers only set one of the two.
  try {
    if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;
  } catch (e) { }
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}
/** URL for this device using the shop's saved settings */
function waUrl(phone, text) {
  return waUrlFor(S.settings.waMode || 'auto', phone, text, S.settings.countryCode || '91', isMobileDevice());
}
/**
 * Open WhatsApp with the message pre-typed and return the URL used.
 *  - counter PC  → web.whatsapp.com in the tab that is already logged in
 *  - phone       → the WhatsApp app (wa.me)
 */
function waOpen(phone, text) {
  const url = waUrl(phone, text);
  let win = null;
  try { win = window.open(url, '_blank'); } catch (e) { win = null; }
  if (!win) { try { location.href = url; } catch (e) { } }   // popup blocked → same tab
  if (S.settings.waAutoCopy) copyText(text);
  return url;
}
function waLink(phone, text) {   // legacy helper (always app link)
  return waUrlFor('app', phone, text, S.settings.countryCode || '91', true);
}
