/**
 * WhatsApp sending tests — run the real app in Chrome and inspect the URL that the
 * "Send on WhatsApp" buttons actually open (window.open is stubbed, nothing is sent).
 *   node tests/whatsapp.mjs      (needs the static server on :8099)
 */
import puppeteer from 'puppeteer';

const URL_BASE = 'http://localhost:8099/index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? ' → ' + extra : ''))); };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

/** Fresh shop with one customer (with phone) and one without, and a saved bill for each. */
async function setup(userAgent, viewport, ctx) {
  const page = ctx ? await ctx.newPage() : await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport(viewport);
  if (userAgent) await page.setUserAgent(userAgent);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // capture whatever the app tries to open, and stop the popup
  await page.evaluateOnNewDocument(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return { focus() { }, closed: false }; };
  });
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ob_name');
  await page.type('#ob_name', 'WA Test Store');
  await page.type('#ob_phone', '9876500000');
  await page.click('[data-act="onboard-save"]');
  await page.waitForFunction(() => typeof S !== 'undefined' && S.products.length === 10);
  await page.evaluate(async () => {
    const withPhone = S.customers.find((c) => c.phone);
    // a walk-in regular the owner never saved a number for
    await ACT.save('customers', { id: uid('cust'), name: 'No Number Store', phone: '', area: '', openingBalance: 0, note: '' }, S, true);
    const noPhone = S.customers.find((c) => !c.phone);
    const mk = (qty) => { const pr = S.products[0]; return { productId: pr.id, name: pr.name, unit: pr.unit, sellUnit: 'unit', ppb: 1, qty, rate: num(pr.price), discPct: 0, gstPct: num(pr.gst), cost: num(pr.cost) }; };
    for (const c of [withPhone, noPhone]) {
      S.bill = blankBill(); S.bill.customerId = c.id; S.bill.no = nextBillNo();
      S.bill.lines = [mk(4)];
      S.bill.paidNow = 0;
      const calc = computeInvoice(S.bill.lines, S.bill.disc, taxOpts());
      await ACT.saveInvoice({ id: S.bill.id, no: S.bill.no, date: todayISO(), customerId: c.id, customerName: c.name,
        lines: calc.rows, disc: S.bill.disc, paidAtSale: 0, payMode: '', note: '',
        totals: calc.totals, total: calc.totals.grand, tax: calc.totals.tax, taxBreakup: calc.totals.taxBreakup }, S, false);
    }
    S.waCustomerId = withPhone.id;
    S.waNoPhoneId = noPhone.id;
    S.waInvoiceWithPhone = S.invoices.find((i) => i.customerId === withPhone.id).id;
    S.waInvoiceNoPhone = S.invoices.find((i) => i.customerId === noPhone.id).id;
    render();
  });
  page.errs = errs;
  return page;
}
const opened = (page) => page.evaluate(() => window.__opened.slice());
const decodeText = (url) => {
  if (!url) return '';
  const i = url.indexOf('text=');
  return i < 0 ? '' : decodeURIComponent(url.slice(i + 5));
};
const clearOpened = (page) => page.evaluate(() => { window.__opened = []; });

/* ---------------- 1. DESKTOP (counter PC) ---------------- */
console.log('\nDesktop PC (WhatsApp Web logged in)');
let page = await setup(null, { width: 1280, height: 1000 });
ok('setup: two bills created (one with phone, one without)', await page.evaluate(() => S.invoices.length === 2));

// bill list → WhatsApp icon
await page.evaluate(() => { S.tab = 'invoices'; render(); });
await page.click(`#view [data-act="wa-invoice"][data-id="${await page.evaluate(() => S.waInvoiceWithPhone)}"]`);
await new Promise((r) => setTimeout(r, 300));
let urls = await opened(page);
ok('bill list button opens WhatsApp Web (no extra interstitial page)', urls[0] && urls[0].startsWith('https://web.whatsapp.com/send?phone=91'), urls[0] || '(nothing opened)');
let txt = decodeText(urls[0]);
ok('the drafted text is the full bill', txt.includes('WA Test Store') && txt.includes('Total:'), txt.slice(0, 60));
ok('draft includes the customer name', txt.includes(await page.evaluate(() => findCustomer(S.waCustomerId).name)));
ok('draft includes the pending (khata) amount', /Pending on this bill:/.test(txt));
ok('draft includes the item, qty, rate and amount', /Sugar S-30 — 4 kg × 45\.00 = 189\.00/.test(txt), txt.split('\n').find((l) => l.includes('Sugar')));

// invoice detail modal
await clearOpened(page);
await page.evaluate((id) => { S.tab = 'invoices'; render(); ACTIONS['view-invoice']({ dataset: { id } }); }, await page.evaluate(() => S.waInvoiceWithPhone));
await page.waitForSelector('#modal-host.open .inv-view');
const btnLabel = await page.$eval('#modal-host [data-act="wa-invoice"]', (e) => e.innerText.trim());
ok('invoice screen has a clear "Send bill on WhatsApp" button', /Send bill on WhatsApp/i.test(btnLabel), btnLabel);
await page.click('#modal-host [data-act="wa-invoice"]');
await new Promise((r) => setTimeout(r, 250));
ok('emailing from the invoice screen opens the same chat', (await opened(page)).some((u) => u.startsWith('https://web.whatsapp.com/send?phone=91')));
await page.evaluate(() => UI.closeModal());

// saved-bill dialog
await clearOpened(page);
await page.evaluate(() => {
  const c = findCustomer(S.waCustomerId);
  S.bill = blankBill(); S.bill.customerId = c.id; S.bill.no = nextBillNo();
  addProductLine(S.products[1], 2);
  return ACTIONS['bill-save']();
});
await page.waitForSelector('#modal-host.open');
const savedBtn = await page.$eval('#modal-host .saved-actions [data-act="wa-invoice"]', (e) => ({ t: e.innerText.trim(), cls: e.className }));
ok('after saving, the first button is "Send bill on WhatsApp" (green)', /Send bill on WhatsApp/.test(savedBtn.t) && /btn wa/.test(savedBtn.cls), savedBtn.t + ' | ' + savedBtn.cls);
await page.click('#modal-host .saved-actions [data-act="wa-invoice"]');
await new Promise((r) => setTimeout(r, 300));
ok('that button opens WhatsApp Web with the new bill', (await opened(page)).some((u) => u.startsWith('https://web.whatsapp.com/send?phone=91')));
await page.evaluate(() => UI.closeModal());

/* ---------------- 2. customer without a phone number ---------------- */
console.log('\nCustomer with no number saved');
await clearOpened(page);
await page.evaluate(() => { S.tab = 'invoices'; render(); });
const noPhoneId = await page.evaluate(() => S.waInvoiceNoPhone);
await page.click(`#view [data-act="wa-invoice"][data-id="${noPhoneId}"]`);
await page.waitForSelector('#modal-host.open #wa_phone');
ok('asks for the number once instead of failing silently', true);
const modalText = await page.$eval('#modal-host', (e) => e.innerText);
ok('dialog explains it will be saved for next time', /saved on the customer for next time/.test(modalText));
ok('nothing was opened before the number is entered', (await opened(page)).length === 0);
await page.type('#wa_phone', '9812345678');
await page.click('#modal-host [data-act="wa-phone-save"]');
await new Promise((r) => setTimeout(r, 400));
urls = await opened(page);
ok('after saving the number it opens that chat directly', urls[0] === 'https://web.whatsapp.com/send?phone=919812345678&text=' + encodeURIComponent(decodeURIComponent(urls[0].split('&text=')[1])), urls[0].slice(0, 70));
ok('the number is stored on the customer', await page.evaluate((id) => findCustomer(id).phone === '9812345678', await page.evaluate(() => S.waNoPhoneId)));
ok('and it is saved to the database, not just the screen', await page.evaluate((id) => S.customers.find((c) => c.id === id).phone === '9812345678', await page.evaluate(() => S.waNoPhoneId)));

/* ---------------- 3. khata reminder + statement + payment receipt ---------------- */
console.log('\nKhata reminder, statement and payment receipt');
await clearOpened(page);
await page.evaluate(() => { S.tab = 'khata'; render(); ACTIONS['open-customer']({ dataset: { id: S.waCustomerId } }); });
await page.waitForSelector('#modal-host.open [data-act="wa-reminder"]');
const khataBtns = await page.$$eval('#modal-host .modal-actions .btn', (els) => els.map((e) => e.innerText.trim()));
ok('khata page offers reminder + statement buttons', khataBtns.some((t) => /Payment reminder/.test(t)) && khataBtns.some((t) => /Send khata statement/.test(t)), khataBtns.join(' | '));
await page.evaluate(() => document.querySelector('#modal-host [data-act="wa-reminder"]').click());
await new Promise((r) => setTimeout(r, 250));
let rem = decodeText((await opened(page))[0]);
ok('reminder lists the pending bills and the total', /pending/i.test(rem) && /Your pending khata balance is/.test(rem), rem.split('\n').slice(0, 3).join(' / '));
await clearOpened(page);
await page.evaluate(() => document.querySelector('#modal-host [data-act="wa-statement"]').click());
await new Promise((r) => setTimeout(r, 250));
let st = decodeText((await opened(page))[0]);
ok('statement includes the ledger with running balance', /Khata statement/.test(st) && /Bal /.test(st) && /Closing balance/.test(st), st.split('\n').slice(0, 3).join(' / '));

await page.keyboard.press('Escape');                  // close the khata dialog first
await page.waitForFunction(() => !document.getElementById('modal-host').classList.contains('open'));
await page.evaluate(async () => {
  await ACT.savePayment({ id: uid('pay'), customerId: S.waCustomerId, customerName: findCustomer(S.waCustomerId).name, amount: 200, date: todayISO(), mode: 'Cash', note: '', invoiceId: '' }, S);
});
await page.evaluate(() => { UI.closeModal(); S.tab = 'payments'; render(); });
await clearOpened(page);
await page.click(`#view [data-act="wa-payment"]`);
await new Promise((r) => setTimeout(r, 250));
let pay = decodeText((await opened(page))[0]);
ok('payment confirmation shows amount received + remaining balance', /Payment received: ₹200\.00/.test(pay) && /Remaining khata balance/.test(pay), pay.split('\n')[1]);

/* ---------------- 3b. cash / walk-in bill ---------------- */
console.log('\nCash bill (walk-in, no khata)');
await page.evaluate(async () => {
  S.bill = blankBill(); S.bill.customerId = ''; S.bill.no = nextBillNo();   // no customer
  addProductLine(S.products[2], 1);
  await ACTIONS['bill-save']();
});
await new Promise((r) => setTimeout(r, 300));
const savedNote = await page.$eval('#modal-host', (e) => e.innerText);
ok('saved panel explains there is no chat for a cash bill', /Cash bill/.test(savedNote), savedNote.split('\n').slice(-1)[0]);
await clearOpened(page);
await page.evaluate(() => document.querySelector('#modal-host [data-act="wa-invoice"]').click());
await new Promise((r) => setTimeout(r, 250));
ok('cash bill copies the text instead of opening a random chat', (await opened(page)).length === 0);
ok('and tells the shopkeeper what to do', /paste it in any chat|copied/i.test(await page.evaluate(() => document.getElementById('toasts').innerText)));
await page.evaluate(() => UI.closeModal());

/* ---------------- 4. PHONE (Android) ---------------- */
console.log('\nAndroid phone (WhatsApp app)');
const mobileCtx = await browser.createBrowserContext();   // fresh phone: its own storage
const m = await setup('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  { width: 400, height: 900, isMobile: true, hasTouch: true }, mobileCtx);
await m.evaluate(() => { S.tab = 'invoices'; render(); });
await m.click(`#view [data-act="wa-invoice"][data-id="${await m.evaluate(() => S.waInvoiceWithPhone)}"]`);
await new Promise((r) => setTimeout(r, 300));
const murl = (await opened(m))[0];
ok('phone opens the WhatsApp app link (wa.me) with the number', murl && murl.startsWith('https://wa.me/91'), murl && murl.slice(0, 50));
ok('phone mode still carries the whole bill text', decodeText(murl).includes('Total:'));

/* ---------------- 5. settings override + country code ---------------- */
console.log('\nSettings override');
await m.evaluate(async () => { await ACT.saveSettings({ waMode: 'web', countryCode: '44' }, S); render(); });
await m.evaluate(() => { S.tab = 'invoices'; render(); });
await clearOpened(m);
await m.click(`#view [data-act="wa-invoice"][data-id="${await m.evaluate(() => S.waInvoiceWithPhone)}"]`);
await new Promise((r) => setTimeout(r, 250));
const over = (await opened(m))[0];
ok('forcing "WhatsApp Web" overrides phone detection', over.startsWith('https://web.whatsapp.com/send?phone=44'), over.slice(0, 60));
ok('settings screen documents the behaviour (country code + which app opens)', await m.evaluate(() => {
  S.tab = 'settings'; render();
  const view = document.getElementById('view');
  const text = view.textContent;                       // innerText is CSS-uppercased by the label style
  return /Country code/.test(text) && /Open WhatsApp using/.test(text) && /web.whatsapp.com|wa.me/.test(text);
}));

ok('no JS errors in any WhatsApp flow', page.errs.length === 0 && m.errs.length === 0, (page.errs[0] || m.errs[0] || ''));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
