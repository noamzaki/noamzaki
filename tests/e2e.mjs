/**
 * End-to-end test of the real app in a real browser (headless Chrome).
 *   python3 -m http.server 8099 &   then   node tests/e2e.mjs
 *
 * Covers: onboarding, demo seed, stock-in, billing (multi-line, box units, discount,
 * part payment), stock auto-deduction, khata ledger + FIFO allocation, payment recording,
 * invoice edit (stock must not double-count), invoice delete (stock restored), reports.
 * Also saves screenshots to ./shots/.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

// ?local=1 → this browser only, so the tests never touch the real Firebase project
const URL_BASE = process.env.APP_URL || 'http://localhost:8099/index.html?local=1';
const SHOTS = 'screenshots';
mkdirSync(SHOTS, { recursive: true });

const errors = [];
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const close = (a, b) => Math.abs(a - b) < 0.02;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,1000']
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());

const snap = async (name, opts = {}) => {
  if (opts.mobile) await page.setViewport({ width: 400, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1.4 });
  await new Promise((r) => setTimeout(r, 220));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: !!opts.full });
};
const state = (fn, ...args) => page.evaluate(fn, ...args);
const click = async (sel) => { await page.waitForSelector(sel, { visible: true }); await page.click(sel); };
/* Triple-click does not reliably select inside <input type=number>, so clear first. */
const fill = async (sel, val) => {
  await page.waitForSelector(sel);
  await page.$eval(sel, (el) => { el.value = ''; });
  await page.type(sel, val);
};

console.log('\nBoot + onboarding');
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#modal-host.open', { timeout: 10000 });
ok('first-run onboarding appears', await page.$('#ob_name') !== null);
await page.type('#ob_name', 'Shree Balaji Traders');
await page.type('#ob_phone', '9876543210');
await page.type('#ob_gst', '27ABCDE1234F1Z5');
await page.type('#ob_addr', 'Shop 14, APMC Market, Mumbai');
await snap('01-onboarding');
await click('[data-act="onboard-save"]');
await page.waitForFunction(() => typeof S !== 'undefined' && S.ready && S.products.length === 10, { timeout: 15000 });
ok('demo data seeded (10 items, 4 customers)', await state(() => S.products.length === 10 && S.customers.length === 4));
ok('shop name saved to settings', await state(() => S.settings.shopName === 'Shree Balaji Traders'));
ok('every seeded item has an opening stock movement', await state(() => S.moves.length === 10 && S.moves.every((m) => m.type === 'purchase')));
await snap('02-dashboard', { full: true });

console.log('\nStock in (purchase) raises stock and averages cost');
const sugarBefore = await state(() => { const p = S.products.find((x) => x.code === 'SUG30'); return { id: p.id, stock: p.stock, cost: p.cost }; });
await state(() => { S.tab = 'products'; render(); });
await click(`.row[data-act="open-product"][data-id="${sugarBefore.id}"] .icon-btn[data-act="stock-in-modal"]`);
await page.waitForSelector('#si_qty');
await fill('#si_qty', '100');
await fill('#si_cost', '45');
await click('#modal-host [data-act="stock-in-save"]');
await page.waitForFunction((id) => S.products.find((p) => p.id === id).stock === 600, {}, sugarBefore.id);
ok('stock 500 + 100 = 600', await state((id) => S.products.find((p) => p.id === id).stock === 600, sugarBefore.id));
ok('weighted average cost updated (41 → 41.67)', close(await state((id) => S.products.find((p) => p.id === id).cost, sugarBefore.id), 41.67));
ok('movement log recorded the purchase', await state((id) => S.moves.some((m) => m.productId === id && m.type === 'purchase' && m.qty === 100), sugarBefore.id));
await snap('03-stock', { full: true });

console.log('\nBilling — multi-line, box unit, discount, part payment');
await state(() => { S.tab = 'bill'; S.bill = blankBill(); render(); });
await page.select('[data-change="bill-customer"]', await state(() => S.customers[0].id));
await page.waitForSelector('#bill-search');
// line 1: Sugar × 20 kg (typed search, Enter picks first hit)
await page.type('#bill-search', 'sugar');
await page.keyboard.press('Enter');
await page.waitForSelector('.bill-line');
// line 2: Sunflower Oil — sell as a BOX of 12
await page.type('#bill-search', 'oil');
await page.keyboard.press('Enter');
await page.waitForFunction(() => S.bill.lines.length === 2);
await state(() => { S.bill.lines[1].sellUnit = 'box'; const p = findProduct(S.bill.lines[1].productId); S.bill.lines[1].rate = round2(num(p.price) * num(p.ppb)); S.bill.lines[1].qty = 2; render(); });
await page.waitForSelector('.bill-line');
// quantities + bill discount + part payment via the real inputs
await page.evaluate(() => {
  const setV = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  setV('.bill-line:nth-child(1) input[data-f="qty"]', '20');
  setV('[data-input="bill-disc"][data-f="value"]', '');
  setV('[data-input="bill-field"][data-f="paidNow"]', '1000');
});
await page.select('[data-change="bill-disc"][data-f="type"]', 'pct');
await page.evaluate(() => { const el = document.querySelector('[data-input="bill-disc"][data-f="value"]'); el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForFunction(() => num(S.bill.paidNow) === 1000);
const billPreview = await state(() => {
  const t = computeInvoice(S.bill.lines, S.bill.disc, taxOpts()).totals;
  return { grand: t.grand, tax: t.tax, disc: t.billDiscount, qty: t.qty };
});
await snap('04-bill', { full: true });
await click('[data-act="bill-save"]');
await page.waitForFunction(() => S.invoices.length === 1, { timeout: 5000 });
const inv1 = await state(() => S.invoices[0]);
ok('bill saved with an invoice number', /^INV-0001$/.test(inv1.no), inv1.no);
ok('grand total matches the on-screen total', close(inv1.total, billPreview.grand), `${inv1.total} vs ${billPreview.grand}`);
ok('5% bill discount stored', close(inv1.totals.billDiscount, billPreview.disc));
ok('GST on the bill is 5% of taxable', close(inv1.tax, round3(inv1.totals.subtotal * 0.05)), String(inv1.tax));
ok('paid-at-billing recorded', close(inv1.paidAtSale, 1000));
function round3(n) { return Math.round(n * 1000) / 1000; }

console.log('\nStock auto-deduction');
const afterBill = await state(() => {
  const sug = S.products.find((p) => p.code === 'SUG30');
  const oil = S.products.find((p) => p.code === 'OIL1L');
  return { sugar: sug.stock, oil: oil.stock, oilPPB: oil.ppb };
});
ok('sugar 600 − 20 = 580', close(afterBill.sugar, 580), String(afterBill.sugar));
ok('oil 96 − (2 boxes × 12) = 72', close(afterBill.oil, 72), String(afterBill.oil));
ok('box sales logged with a readable note', await state(() => S.moves.some((m) => m.type === 'sale' && /box × 12/.test(m.note || ''))));
ok('sale movement value uses cost (profit tracking)', await state(() => S.moves.some((m) => m.type === 'sale' && m.value < 0)));
await snap('05-saved-bill');
await page.keyboard.press('Escape');   // user taps "Done" on the saved-bill dialog
await page.waitForFunction(() => !document.getElementById('modal-host').classList.contains('open'));

console.log('\nKhata ledger + FIFO payment allocation');
const alloc1 = await state(() => allocatePayments(S.invoices, S.payments));
ok('part payment splits the bill: paid part + pending part', alloc1.byInvoice[Object.keys(alloc1.byInvoice)[0]].status === 'partial');
const cust0 = await state(() => ({ id: S.customers[0].id, name: S.customers[0].name, balance: customerBalance(S.customers[0], S.invoices, S.payments) }));
ok('customer khata balance = bill − paid (no payment record invented)', close(cust0.balance, round3(inv1.total - 1000)), `${cust0.balance} vs ${round3(inv1.total - 1000)}`);

await state(() => { S.tab = 'khata'; render(); });
await page.waitForSelector('.row[data-act="open-customer"]');
await snap('06-khata', { full: true });
await click(`.row[data-act="open-customer"][data-id="${cust0.id}"]`);
await page.waitForSelector('.kh-bal');
const balShown = await page.$eval('.kh-bal b', (e) => e.textContent);
const balExpected = await state((b) => money(b), cust0.balance);
ok('khata page shows the pending amount', balShown === balExpected, `${balShown} vs ${balExpected}`);
await snap('07-khata-detail');
await page.keyboard.press('Escape');

console.log('\nRecord an evening payment');
await state(() => { S.tab = 'payments'; render(); });
await click('[data-act="pay-modal"]');
await page.waitForSelector('#pm_cust');
await page.select('#pm_cust', cust0.id);
await page.waitForFunction(() => document.getElementById('pm_cust') && document.getElementById('pm_cust').value !== '');
await page.waitForSelector('#pm_amt');
await page.type('#pm_amt', '500');
await click('#modal-host [data-act="pay-save"]');
await page.waitForFunction(() => S.payments.length === 1, { timeout: 5000 });
const afterPay = await state(() => ({ bal: customerBalance(S.customers[0], S.invoices, S.payments), alloc: allocatePayments(S.invoices, S.payments) }));
ok('payment recorded', await state(() => S.payments[0].amount === 500));
ok('khata balance reduced by exactly 500', close(afterPay.bal, round3(cust0.balance - 500)), `${afterPay.bal} vs ${round3(cust0.balance - 500)}`);
ok('FIFO applied the 500 to the open bill (3369 → 2869)', close(afterPay.alloc.byInvoice[inv1.id].due, round3(inv1.total - 1000 - 500)), String(afterPay.alloc.byInvoice[inv1.id].due));
ok('no phantom advance created', afterPay.alloc.advance === 0);
await snap('08-payment-saved');
await page.keyboard.press('Escape');

console.log('\nInvoice edit must not double-count stock');
await state(() => { S.tab = 'invoices'; render(); });
const stockBeforeEdit = await state(() => S.products.find((p) => p.code === 'SUG30').stock);
await click(`.row[data-act="view-invoice"][data-id="${inv1.id}"]`);
await page.waitForSelector('.inv-view');
await snap('09-invoice-view');
await click(`#modal-host [data-act="edit-invoice"][data-id="${inv1.id}"]`);
await page.waitForFunction(() => S.bill && S.bill._editing === true);
ok('bill opened in edit mode with its lines', await state(() => S.bill.lines.length === 2));
await page.evaluate(() => { const el = document.querySelector('.bill-line:nth-child(1) input[data-f="qty"]'); el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await click('[data-act="bill-save"]');
await page.waitForFunction(() => S.invoices.length === 1 && S.invoices[0].lines[0].qty === 50, { timeout: 5000 });
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.getElementById('modal-host').classList.contains('open'));
const stockAfterEdit = await state(() => S.products.find((p) => p.code === 'SUG30').stock);
ok('edited qty 20 → 50 takes 30 more from stock (580 → 550)', close(stockAfterEdit, stockBeforeEdit - 30), `${stockBeforeEdit} → ${stockAfterEdit}`);
ok('reverse movement logged for the edit', await state(() => S.moves.some((m) => m.type === 'reverse' && m.refLabel.includes('edited'))));
ok('invoice number unchanged after edit', await state(() => S.invoices[0].no === 'INV-0001'));

console.log('\nDelete bill returns the stock');
await state(() => { S.tab = 'invoices'; render(); });
await click(`.row[data-act="view-invoice"][data-id="${inv1.id}"]`);
await page.waitForSelector('[data-act="del-invoice"]');
await click(`#modal-host [data-act="del-invoice"][data-id="${inv1.id}"]`);
await page.waitForFunction(() => S.invoices.length === 0, { timeout: 5000 });
const stockAfterDelete = await state(() => S.products.find((p) => p.code === 'SUG30').stock);
ok('sugar stock back to 600', close(stockAfterDelete, 600), String(stockAfterDelete));
ok('oil stock back to 96', close(await state(() => S.products.find((p) => p.code === 'OIL1L').stock), 96));
ok('movement log keeps a full audit trail of sale → reverse', await state(() => S.moves.filter((m) => m.type === 'reverse').length >= 2));

console.log('\nReports + dashboard');
await state(() => { S.tab = 'reports'; S.range = { from: addDaysISO(todayISO(), -1), to: todayISO() }; render(); });
await page.waitForSelector('.bars, .mini-stats');
ok('report view renders with presets', (await page.$$('.chip[data-act="range-preset"]')).length === 6);
await snap('10-reports', { full: true });
await state(() => { S.tab = 'dash'; render(); });
await page.waitForSelector('.kpis');
ok("dashboard KPIs show today's collection of 500", (await page.$eval('.kpis', (e) => e.textContent)).includes('500'));
await snap('11-dashboard-mobile', { mobile: true, full: true });

console.log('\nPrint / WhatsApp output');
const printHTML = await state(() => {
  const cust = S.customers[0];
  const inv = {
    id: 'test', no: 'INV-0099', date: todayISO(), customerId: cust.id, customerName: cust.name,
    lines: [{ productId: '', name: 'Sugar S-30', unit: 'kg', sellUnit: 'unit', ppb: 1, qty: 5, rate: 45, discPct: 0, gstPct: 5, cost: 41, total: 236.25, taxable: 225, tax: 11.25 }],
    disc: { type: 'none', value: 0 }, paidAtSale: 0, payMode: '', note: '',
    total: 236.25, tax: 11.25,
    totals: { gross: 225, itemDiscount: 0, billDiscount: 0, subtotal: 225, tax: 11.25, total: 236.25, roundOff: 0, grand: 236.25, cost: 205, qty: 5, taxBreakup: [{ rate: 5, taxable: 225, tax: 11.25 }] }
  };
  return invoiceHTML(inv, 'invoice');
});
ok('invoice HTML contains shop name and GSTIN', printHTML.includes('Shree Balaji Traders') && printHTML.includes('27ABCDE1234F1Z5'));
ok('invoice HTML has amount in words', /Rupees and Twenty Five Paise Only/.test(printHTML));
ok('invoice HTML has a totals box', printHTML.includes('Grand Total'));
const waText = await state(() => { const inv = { no: 'INV-0009', date: todayISO(), customerName: 'Ramesh', lines: [{ name: 'Sugar', qty: 5, unit: 'kg', sellUnit: 'unit', rate: 45, total: 225 }], total: 225, paidAtSale: 0, totals: {} }; return invoiceWAText(inv); });
ok('WhatsApp message is formatted with *bold* and totals', waText.includes('*Shree Balaji Traders*') && waText.includes('225'));
const link = await state(() => waLink('9876543210', 'hi'));
ok('WhatsApp link adds India country code', link.startsWith('https://wa.me/919876543210'));

console.log('\nReload (persistence)');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof S !== 'undefined' && S.ready, { timeout: 15000 });
ok('settings survive reload', await state(() => S.settings.shopName === 'Shree Balaji Traders'));
ok('items + inventory survive reload', await state(() => S.products.length === 10));
ok('stock movements survive reload', await state(() => S.moves.length > 10));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) { console.log('\nJS errors captured:\n - ' + errors.slice(0, 12).join('\n - ')); }
else console.log('No JS errors in the browser console.');
process.exit(fail || errors.length ? 1 : 0);
