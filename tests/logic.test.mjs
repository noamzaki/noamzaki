/**
 * Unit tests for the money / khata / stock logic.
 *   node tests/logic.test.mjs
 * The test extracts the PURE-LOGIC block from src/js/00-core.js, so tests always
 * run against the exact code shipped in the app.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'src/js/00-core.js'), 'utf8');
const m = src.match(/\/\* ======== PURE-LOGIC-START ======== \*\/([\s\S]*?)\/\* ======== PURE-LOGIC-END ======== \*\//);
if (!m) { console.error('Could not find PURE-LOGIC block'); process.exit(1); }

const tmpDir = join(root, '.tmp-test');
mkdirSync(tmpDir, { recursive: true });
const tmp = join(tmpDir, 'core.mjs');
writeFileSync(tmp, m[1] + `
export { num, round2, money, qtyFmt, pct, isoDate, todayISO, addDaysISO, daysBetween, esc, computeLine, computeInvoice,
  buildLedger, customerBalance, allocatePayments, agingBuckets, isLowStock, baseQty, packDisplay, stockValue, avgCost,
  reportRange, csv, dueCustomers, amountInWords, inRange, sortByDate, normPhone, waUrlFor,
  portalEmail, portalIdOk, portalIdLooksLikeEmail };
`, 'utf8');

const C = await import('file://' + tmp);
const require = createRequire(import.meta.url);
void require;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} expected ${b}, got ${a}`);

console.log('\nFormatting & rounding');
t('round2 kills float noise', () => { assert.equal(C.round2(0.1 + 0.2), 0.3); assert.equal(C.round2(1.005), 1.01); });
t('money uses Indian grouping', () => {
  assert.equal(C.money(1234.5), '₹1,234.50');
  assert.equal(C.money(1234567.891), '₹12,34,567.89');
  assert.equal(C.money(-500, false), '-500.00');
});
t('qty formatting', () => { assert.equal(C.qtyFmt(12), '12'); assert.equal(C.qtyFmt(12.5), '12.5'); });
t('date helpers', () => {
  assert.equal(C.addDaysISO('2026-09-18', 1), '2026-09-19');
  assert.equal(C.addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(C.daysBetween('2026-09-01', '2026-09-18'), 17);
});
t('amount in words (Indian)', () => {
  assert.equal(C.amountInWords(1250), 'One Thousand Two Hundred Fifty Rupees Only');
  assert.equal(C.amountInWords(1500000), 'Fifteen Lakh Rupees Only');
  assert.equal(C.amountInWords(0), 'Zero Rupees Only');
  assert.match(C.amountInWords(105.5), /Hundred Five Rupees and Fifty Paise Only$/);
});

console.log('\nLine + invoice maths');
const O = { taxEnabled: true, priceIncludesTax: false, roundOff: false };
t('single line, tax exclusive', () => {
  const r = C.computeLine({ qty: 10, rate: 45, discPct: 0, gstPct: 5 }, O);
  approx(r.gross, 450); approx(r.tax, 22.5); approx(r.total, 472.5);
});
t('line discount then GST', () => {
  const r = C.computeLine({ qty: 10, rate: 100, discPct: 10, gstPct: 18 }, O);
  approx(r.gross, 1000); approx(r.disc, 100); approx(r.taxable, 900); approx(r.tax, 162); approx(r.total, 1062);
});
t('MRP-style tax inclusive rates', () => {
  const r = C.computeLine({ qty: 1, rate: 105, gstPct: 5 }, { taxEnabled: true, priceIncludesTax: true });
  approx(r.taxable, 100); approx(r.tax, 5); approx(r.total, 105);
});
t('tax disabled switches GST off', () => {
  const r = C.computeLine({ qty: 3, rate: 100, gstPct: 18 }, { taxEnabled: false });
  approx(r.tax, 0); approx(r.total, 300);
});
t('bill discount is split across lines and totals tie up', () => {
  const inv = C.computeInvoice(
    [{ qty: 2, rate: 100, gstPct: 0 }, { qty: 1, rate: 50, gstPct: 0 }],
    { type: 'pct', value: 10 }, O);
  approx(inv.totals.gross, 250); approx(inv.totals.billDiscount, 25);
  approx(inv.rows[0].billDiscShare, 20); approx(inv.rows[1].billDiscShare, 5);
  approx(inv.rows.reduce((s, r) => s + r.total, 0), 225);
  approx(inv.totals.total, 225);
});
t('round off makes a whole rupee grand total', () => {
  const inv = C.computeInvoice([{ qty: 10, rate: 45, gstPct: 5 }], { type: 'none', value: 0 },
    { taxEnabled: true, priceIncludesTax: false, roundOff: true });
  assert.equal(inv.totals.grand, 473);
  approx(inv.totals.roundOff, 0.5);
});
t('tax breakup groups by GST rate', () => {
  const inv = C.computeInvoice([
    { qty: 1, rate: 100, gstPct: 5 }, { qty: 1, rate: 100, gstPct: 18 }, { qty: 1, rate: 100, gstPct: 5 }
  ], { type: 'none', value: 0 }, O);
  assert.equal(inv.totals.taxBreakup.length, 2);
  approx(inv.totals.taxBreakup[0].rate, 5); approx(inv.totals.taxBreakup[0].taxable, 200);
  approx(inv.totals.taxBreakup[0].tax, 10);
});
t('bill discount larger than bill is clamped', () => {
  const inv = C.computeInvoice([{ qty: 1, rate: 100, gstPct: 0 }], { type: 'amt', value: 500 }, O);
  approx(inv.totals.billDiscount, 100); approx(inv.totals.total, 0);
});
t('line totals always equal the invoice total (no rounding leaks)', () => {
  const inv = C.computeInvoice([
    { qty: 3, rate: 33.33, gstPct: 5 }, { qty: 7, rate: 12.35, gstPct: 12 }, { qty: 2.5, rate: 61, gstPct: 18 }
  ], { type: 'pct', value: 7.5 }, O);
  approx(inv.rows.reduce((s, r) => s + r.total, 0), inv.totals.total);
});
t('cost snapshot for profit', () => {
  const inv = C.computeInvoice([{ qty: 10, rate: 45, gstPct: 0, cost: 40 }], { type: 'none', value: 0 }, O);
  approx(inv.totals.cost, 400);
});

console.log('\nKhata / ledger');
const custA = { id: 'A', name: 'Ramesh', openingBalance: 1000, openingDate: '2026-08-01' };
const invs = [
  { id: 'i1', no: 'INV-0001', date: '2026-09-01', customerId: 'A', total: 500, paidAtSale: 200 },
  { id: 'i2', no: 'INV-0002', date: '2026-09-10', customerId: 'A', total: 1200, paidAtSale: 0 },
  { id: 'i3', no: 'INV-0003', date: '2026-09-12', customerId: 'B', total: 300, paidAtSale: 300 }
];
const pays = [
  { id: 'p1', date: '2026-09-11', customerId: 'A', amount: 300, mode: 'Cash' },
  { id: 'p2', date: '2026-09-15', customerId: 'A', amount: 500, mode: 'UPI' }
];
t('customer balance = opening + bills − payments − paid at sale', () => {
  approx(C.customerBalance(custA, invs, pays), 1000 + 500 + 1200 - 200 - 800);
});
t('ledger running balance ends at the same figure', () => {
  const led = C.buildLedger(custA, invs, pays);
  approx(led.balance, 1700);
  approx(led.rows[led.rows.length - 1].balance, 1700);
  assert.equal(led.rows.filter((r) => r.type === 'invoice').length, 2);
});
t('payments clear the OLDEST bill first (FIFO)', () => {
  const a = C.allocatePayments(invs.filter((i) => i.customerId === 'A'), pays);
  approx(a.byInvoice.i1.due, 0);
  assert.equal(a.byInvoice.i1.status, 'paid');
  approx(a.byInvoice.i2.paid, 800 - 300); // 300 went to i1's leftover 300, then 500 goes to i2
  approx(a.byInvoice.i2.due, 1200 - 500);
  approx(a.totalDue, 700);
});
t('a payment linked to a bill is applied there first', () => {
  const a = C.allocatePayments(invs.filter((i) => i.customerId === 'A'),
    [{ id: 'p3', date: '2026-09-16', customerId: 'A', amount: 400, invoiceId: 'i2' }]);
  approx(a.byInvoice.i2.due, 800); // 1200 - 400 linked
  approx(a.byInvoice.i1.due, 300); // 500 - 200 at sale
});
t('bill status reflects money paid at billing time', () => {
  const a = C.allocatePayments([{ id: 's1', date: '2026-09-01', total: 1000, paidAtSale: 400 }], []);
  assert.equal(a.byInvoice.s1.status, 'partial');
  const b = C.allocatePayments([{ id: 's2', date: '2026-09-01', total: 1000, paidAtSale: 0 }], []);
  assert.equal(b.byInvoice.s2.status, 'unpaid');
  const c = C.allocatePayments([{ id: 's3', date: '2026-09-01', total: 1000, paidAtSale: 1000 }], []);
  assert.equal(c.byInvoice.s3.status, 'paid');
  approx(a.byInvoice.s1.paidTotal, 400);
});
t('extra payment shows as advance, not negative due', () => {
  const a = C.allocatePayments([{ id: 'x', date: '2026-09-01', customerId: 'A', total: 100, paidAtSale: 0 }],
    [{ id: 'px', date: '2026-09-02', customerId: 'A', amount: 150 }]);
  approx(a.byInvoice.x.due, 0);
  approx(a.advance, 50);
});
t('aging buckets', () => {
  const today = C.todayISO();
  const old = C.addDaysISO(today, -45), recent = C.addDaysISO(today, -3);
  const b = C.agingBuckets([
    { id: 'o', date: old, total: 400, paidAtSale: 0 },
    { id: 'r', date: recent, total: 250, paidAtSale: 0 }
  ], []);
  approx(b['31-60'], 400); approx(b['0-15'], 250); approx(b['16-30'], 0); approx(b['60+'], 0);
});
t('due customers list is sorted by amount', () => {
  const d = C.dueCustomers(
    [{ id: 'A', openingBalance: 0 }, { id: 'B', openingBalance: 0 }, { id: 'C', openingBalance: 0 }],
    [{ id: 'i1', date: '2026-09-01', customerId: 'A', total: 100, paidAtSale: 0 },
     { id: 'i2', date: '2026-09-01', customerId: 'B', total: 900, paidAtSale: 0 },
     { id: 'i3', date: '2026-09-01', customerId: 'C', total: 300, paidAtSale: 300 }], []);
  assert.deepEqual(d.map((x) => x.customer.id), ['B', 'A']);
});

console.log('\nStock');
t('box unit converts to base pieces', () => {
  assert.equal(C.baseQty(3, 'box', 'pcs', 12), 36);
  assert.equal(C.baseQty(2, 'unit', 'kg', 1), 2);
  assert.equal(C.baseQty(2, 'box', 'pcs', 0), 2); // no pieces-per-box set → treat as base
});
t('pack display in box + piece form', () => {
  assert.equal(C.packDisplay(27, 12, 'pcs'), '2 box + 3 pcs');
  assert.equal(C.packDisplay(24, 12, 'pcs'), '2 box');
  assert.equal(C.packDisplay(5.5, 1, 'kg'), '5.5 kg');
});
t('low stock detection', () => {
  assert.equal(C.isLowStock({ stock: 5, lowStock: 5 }), true);
  assert.equal(C.isLowStock({ stock: 6, lowStock: 5 }), false);
  assert.equal(C.isLowStock({ stock: 0, lowStock: 0 }), false); // alerts switched off
});
t('weighted average cost', () => {
  approx(C.avgCost(10, 100, 10, 120), 110);
  approx(C.avgCost(0, 0, 5, 50), 50);
  approx(C.avgCost(0, 0, 5, 0), 0);
});
t('stock value at cost', () => {
  approx(C.stockValue([{ stock: 10, cost: 40 }, { stock: 2, cost: 100 }]), 600);
});

console.log('\nReports');
t('range report adds up sales, tax, profit, credit', () => {
  const state = {
    invoices: [
      { id: 'i1', date: '2026-09-05', customerId: 'A', total: 1180, paidAtSale: 1000,
        totals: { grand: 1180, tax: 180, billDiscount: 0, itemDiscount: 0, cost: 800, qty: 10 }, lines: [{ productId: 'p', name: 'OIL', qty: 10, unit: 'pcs', cost: 80, total: 1180 }] },
      { id: 'i2', date: '2026-08-30', customerId: 'A', total: 500, paidAtSale: 0, totals: { grand: 500, tax: 0, cost: 300, qty: 5 }, lines: [] }
    ],
    payments: [{ id: 'p', date: '2026-09-06', customerId: 'A', amount: 200, mode: 'UPI' }],
    moves: [{ id: 'm', date: '2026-09-04', type: 'purchase', value: 5000 }]
  };
  const r = C.reportRange(state, '2026-09-01', '2026-09-30');
  approx(r.sales, 1180); approx(r.tax, 180); approx(r.profit, 1180 - 180 - 800);
  approx(r.collected, 200); approx(r.creditGiven, 180); approx(r.purchases, 5000);
  assert.equal(r.billCount, 1);
  assert.equal(r.topProducts[0].name, 'OIL');
});
t('csv escaping', () => {
  const out = C.csv([{ n: 'Ram "the" shop', a: 12 }], [{ label: 'Name', value: 'n' }, { label: 'Amt', value: 'a' }]);
  assert.equal(out.split('\n')[0], '"Name","Amt"');
  assert.ok(out.includes('"Ram ""the"" shop","12"'));
});
t('inRange filter', () => {
  assert.equal(C.inRange('2026-09-10', '2026-09-01', '2026-09-30'), true);
  assert.equal(C.inRange('2026-08-31', '2026-09-01', '2026-09-30'), false);
  assert.equal(C.inRange('', '2026-09-01', '2026-09-30'), false);
});
console.log('\nCustomer portal ids');
t('a simple login id becomes a Firebase email', () => {
  assert.equal(C.portalEmail('ramesh123', 'customers.shop.app'), 'ramesh123@customers.shop.app');
  assert.equal(C.portalEmail('  Ramesh123  ', 'customers.shop.app'), 'ramesh123@customers.shop.app');
});
t('a real email typed by the owner is used as it is', () => {
  assert.equal(C.portalEmail('ramesh@example.com', 'customers.shop.app'), 'ramesh@example.com');
});
t('login ids are validated (3-30 chars, safe characters)', () => {
  assert.equal(C.portalIdOk('ramesh123'), true);
  assert.equal(C.portalIdOk('ramesh@example.com'), true);
  assert.equal(C.portalIdOk('ab'), false);
  assert.equal(C.portalIdOk('ramesh 123'), false);      // spaces not allowed
  assert.equal(C.portalIdOk('ramesh/../x'), false);
  assert.equal(C.portalIdOk(''), false);
});
t('junk is stripped out of generated login ids', () => {
  assert.equal(C.portalEmail('ram esh!123', 'd.app'), 'ramesh123@d.app');
  assert.equal(C.portalEmail('RAMESH-1', 'd.app'), 'ramesh-1@d.app');
});
t('portal email detection', () => {
  assert.equal(C.portalIdLooksLikeEmail('a@b.com'), true);
  assert.equal(C.portalIdLooksLikeEmail('ramesh123'), false);
});

console.log('\nWhatsApp links');
t('10-digit numbers get the country code added', () => {
  assert.equal(C.normPhone('9820011111', '91'), '919820011111');
  assert.equal(C.normPhone('98200 11111', '91'), '919820011111');
  assert.equal(C.normPhone('+91 98200 11111', '91'), '919820011111');
});
t('leading 0 / 00 are cleaned up', () => {
  assert.equal(C.normPhone('09820011111', '91'), '919820011111');
  assert.equal(C.normPhone('0091 9820011111', '91'), '91982011111'.replace('91982011111', '919820011111'));
});
t('numbers that already carry a country code are left alone', () => {
  assert.equal(C.normPhone('919820011111', '91'), '919820011111');
  assert.equal(C.normPhone('+44 7700 900123', '91'), '447700900123');
});
t('other country codes are honoured', () => {
  assert.equal(C.normPhone('4155550123', '1'), '14155550123');
});
t('empty / junk numbers return empty (handled by the add-number dialog)', () => {
  assert.equal(C.normPhone('', '91'), '');
  assert.equal(C.normPhone(null, '91'), '');
  assert.equal(C.normPhone('abc', '91'), '');
});
t('desktop auto-mode opens the already-logged-in WhatsApp Web chat with text', () => {
  const u = C.waUrlFor('auto', '9820011111', 'Bill INV-0001\nTotal ₹500', '91', false);
  assert.ok(u.startsWith('https://web.whatsapp.com/send?phone=919820011111&text='), u);
  assert.ok(u.includes(encodeURIComponent('Total ₹500')), 'message must be URL-encoded');
});
t('phone auto-mode opens the WhatsApp app (wa.me)', () => {
  const u = C.waUrlFor('auto', '9820011111', 'hi', '91', true);
  assert.equal(u, 'https://wa.me/919820011111?text=hi');
});
t('forcing web or app overrides the device default', () => {
  assert.ok(C.waUrlFor('web', '9820011111', 'x', '91', true).includes('web.whatsapp.com'));
  assert.ok(C.waUrlFor('app', '9820011111', 'x', '91', false).includes('wa.me'));
});
t('no number → WhatsApp picks the contact (no broken link)', () => {
  assert.equal(C.waUrlFor('auto', '', 'hello', '91', true), 'https://wa.me/?text=hello');
  assert.equal(C.waUrlFor('auto', '', 'hello', '91', false), 'https://web.whatsapp.com/');
});
t('newlines and *bold* survive encoding', () => {
  const u = C.waUrlFor('app', '9820011111', '*Shop*\nline2', '91', true);
  assert.ok(u.includes('%0Aline2'));
  assert.ok(u.includes('*Shop*'), 'WhatsApp bold markers pass through unescaped');
});

t('html escaping blocks tag injection', () => {
  assert.equal(C.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
