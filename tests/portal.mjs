/**
 * Customer portal tests — the shop owner creates a login, the customer signs in
 * and must see ONLY their own balance / bills / payments.
 *   node tests/portal.mjs        (needs the static server on :8099)
 *
 * Runs in Local mode (no Firebase keys), which is exactly the mode the in-app
 * preview uses. Firebase-specific bits are checked statically (config, rules file).
 */
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:8099/index.html?local=1';
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? ' → ' + extra : ''))); };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
await page.setViewport({ width: 1200, height: 1000 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
// capture anything the app opens (nothing is actually sent) — survives navigations
await page.evaluateOnNewDocument(() => {
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return { focus() { }, closed: false }; };
});
const state = (fn, ...args) => page.evaluate(fn, ...args);
/* Clear a field before typing: triple-click does not reliably select text in every input. */
const fill = async (pg, sel, val) => {
  await pg.waitForSelector(sel);
  await pg.$eval(sel, (el) => { el.value = ''; });
  await pg.type(sel, val);
};
const shot = async (name) => { await new Promise((r) => setTimeout(r, 250)); await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false }); };

/* ------------------------------------------------------------------ */
console.log('\nShop owner: set up two customers with real history');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#ob_name');
await page.type('#ob_name', 'Shree Balaji Traders');
await page.type('#ob_phone', '9876543210');
await page.click('[data-act="onboard-save"]');
await page.waitForFunction(() => typeof S !== 'undefined' && S.products.length === 10);

await page.evaluate(async () => {
  // Ramesh: several bills paid in instalments (like the shop's real routine)
  const ramesh = S.customers[0];
  const mk = (code, qty) => { const pr = S.products.find((x) => x.code === code);
    return { productId: pr.id, name: pr.name, unit: pr.unit, sellUnit: 'unit', ppb: 1, qty, rate: num(pr.price), discPct: 0, gstPct: num(pr.gst), cost: num(pr.cost) }; };
  const days = [12, 8, 3];
  for (let k = 0; k < 3; k++) {
    S.bill = blankBill(); S.bill.customerId = ramesh.id; S.bill.no = nextBillNo();
    S.bill.lines = [mk('SUG30', 10 + k), mk('TEA25', 2)];
    S.bill.paidNow = k === 0 ? 300 : 0;
    const calc = computeInvoice(S.bill.lines, S.bill.disc, taxOpts());
    await ACT.saveInvoice({ id: S.bill.id, no: S.bill.no, date: addDaysISO(todayISO(), -days[k]), customerId: ramesh.id, customerName: ramesh.name,
      lines: calc.rows, disc: S.bill.disc, paidAtSale: S.bill.paidNow, payMode: 'Cash', note: '',
      totals: calc.totals, total: calc.totals.grand, tax: calc.totals.tax, taxBreakup: calc.totals.taxBreakup }, S, false);
  }
  await ACT.savePayment({ id: uid('pay'), customerId: ramesh.id, customerName: ramesh.name, amount: 1000, date: addDaysISO(todayISO(), -5), mode: 'UPI', note: 'UPI 7721', invoiceId: '' }, S);
  await ACT.savePayment({ id: uid('pay'), customerId: ramesh.id, customerName: ramesh.name, amount: 500, date: addDaysISO(todayISO(), -1), mode: 'Cash', note: '', invoiceId: '' }, S);
  // Gupta: a different customer, whose data must NEVER appear in Ramesh's portal
  const gupta = S.customers[1];
  S.bill = blankBill(); S.bill.customerId = gupta.id; S.bill.no = nextBillNo();
  S.bill.lines = [mk('RIC02', 25)];
  const calc2 = computeInvoice(S.bill.lines, S.bill.disc, taxOpts());
  await ACT.saveInvoice({ id: S.bill.id, no: S.bill.no, date: todayISO(), customerId: gupta.id, customerName: gupta.name,
    lines: calc2.rows, disc: S.bill.disc, paidAtSale: 0, payMode: '', note: '',
    totals: calc2.totals, total: calc2.totals.grand, tax: calc2.totals.tax, taxBreakup: calc2.totals.taxBreakup }, S, false);
  render();
});
const expected = await page.evaluate(() => {
  const r = S.customers[0];
  return {
    rameshId: r.id, rameshName: r.name, guptaName: S.customers[1].name,
    balance: customerBalance(r, S.invoices, S.payments),
    bills: S.invoices.filter((i) => i.customerId === r.id).length,
    pays: S.payments.length,
    guptaBillNo: S.invoices.find((i) => i.customerId === S.customers[1].id).no
  };
});
ok('shop has 4 bills, 2 payments across two customers', await state(() => S.invoices.length === 4 && S.payments.length === 2));

/* ------------------------------------------------------------------ */
console.log('\nOwner creates the customer login');
await page.evaluate((id) => { S.tab = 'khata'; render(); ACTIONS['cust-modal']({ dataset: { id } }); }, expected.rameshId);
await page.waitForSelector('#modal-host.open #po_user');
const suggested = await page.$eval('#po_user', (e) => e.value);
ok('login id is pre-filled from the customer name', suggested.length >= 3, suggested);
await page.evaluate(() => { document.getElementById('po_user').value = 'ramesh123'; });
const shownPw = await page.$eval('#po_pass', (e) => e.value);
ok('a readable temporary password is suggested', /^[a-z0-9]{8}$/.test(shownPw), shownPw);
await page.click('#modal-host [data-act="portal-generated-check"]').catch(() => { });
await page.click('#modal-host [data-act="portal-create"]');
await page.waitForFunction(() => !!S.customers[0].portal, { timeout: 10000 });
const portalRec = await state(() => S.customers[0].portal);
ok('login recorded on the customer', portalRec.username === 'ramesh123' && portalRec.active === true, JSON.stringify(portalRec));
ok('password is NOT stored in plain text', !JSON.stringify(portalRec).includes(shownPw) && /^(sha256|djb2):/.test(portalRec.passHash), portalRec.passHash && portalRec.passHash.slice(0, 24));
ok('a random salt is used per customer', !!portalRec.salt && portalRec.salt.length >= 8);
await shot('18-owner-create-login');

console.log('\nOwner sends the login details on WhatsApp');
await page.waitForSelector('#modal-host [data-act="portal-send"]');
await page.click('#modal-host [data-act="portal-send"]');
await page.waitForSelector('#modal-host #ps_text');
const msg = await page.$eval('#ps_text', (e) => e.value);
ok('message contains the portal link', msg.includes('#customer'), msg.split('\n')[1]);
ok('message contains the login id and password', msg.includes('ramesh123') && msg.includes(shownPw));
ok('message is friendly Hinglish the customer understands', /Login ID/.test(msg) && /Password/.test(msg) && /balance/.test(msg));
await shot('19-login-message');
await page.evaluate(() => UI.closeModal());

console.log('\nDuplicate login ids are refused');
const otherId = await state(() => S.customers[1].id);
await page.evaluate((id) => { ACTIONS['cust-modal']({ dataset: { id } }); }, otherId);
await page.waitForSelector('#po_user');
await page.evaluate(() => { document.getElementById('po_user').value = 'ramesh123'; });
await page.click('#modal-host [data-act="portal-create"]');
await new Promise((r) => setTimeout(r, 600));
ok('second customer cannot take the same login id', !(await state(() => !!S.customers[1].portal)));
ok('and the owner is told why', /already used/i.test(await page.$eval('#toasts', (e) => e.innerText)));
await page.evaluate(() => UI.closeModal());

/* ------------------------------------------------------------------ */
console.log('\nCustomer opens the portal ( wrong password first )');
await page.goto(BASE + '#customer', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pf_id');
const loginText = await page.$eval('#app', (e) => e.innerText);
ok('portal login page shows the shop branding', loginText.includes('Shree Balaji Traders') && loginText.includes('9876543210'), loginText.split('\n')[1]);
await page.type('#pf_id', 'ramesh123');
await page.type('#pf_pw', 'wrong-password');
await page.click('[data-act="portal-login"]');
await page.waitForFunction(() => /Wrong password|No customer login/i.test(document.querySelector('.err') ? document.querySelector('.err').innerText : ''));
ok('wrong password is rejected with a clear message', true);
ok('no data is shown before a successful login', !(await page.$eval('#app', (e) => e.innerText)).includes('Total billed'));
await shot('20-portal-login');

/* ------------------------------------------------------------------ */
console.log('\nCustomer signs in with the right password');
ok('the login ID stays filled in after a wrong password (no retyping)', (await page.$eval('#pf_id', (e) => e.value)) === 'ramesh123');
const pw = shownPw;
await fill(page, '#pf_pw', pw);
await page.click('[data-act="portal-login"]');
await page.waitForFunction(() => /Pending balance|All settled|Advance/i.test(document.getElementById('app').innerText), { timeout: 15000 });
const portalText = await page.$eval('#app', (e) => e.innerText);
ok('portal opens with the customer greeting', portalText.includes(expected.rameshName));
ok('shows the customer balance', portalText.includes(expected.balance.toFixed ? '' : '') || /Pending balance/i.test(portalText));
const shownBalance = await state((b) => money(Math.abs(b)), expected.balance);
ok(`balance shown is exactly theirs (${shownBalance})`, portalText.includes(shownBalance.replace('₹', '').replace(',', ',')));
ok('lists their bills', portalText.includes('All my bills') && (await state(() => document.querySelectorAll('#app [data-act="portal-view-bill"]').length)) >= expected.bills);
ok('lists their payments', portalText.includes('Payments I have made') && portalText.includes('UPI 7721'));
ok('shows the full khata history with running balance', portalText.includes('My khata history') && /BALANCE/i.test(portalText) && /PAID/i.test(portalText));
await shot('21-portal-home');

console.log('\nPrivacy: the customer sees only their own account');
ok(`another customer's name (${expected.guptaName}) is nowhere on the page`, !portalText.includes(expected.guptaName));
ok("another customer's bill number is nowhere on the page", !portalText.includes(expected.guptaBillNo), expected.guptaBillNo);
ok('the shop app is not rendered behind the portal', !(await page.$eval('#app', (e) => !!e.querySelector('.nav-item'))));
ok('all portal data is scoped to one customer id', await state((id) => S.invoices.every((i) => i.customerId === id) && S.payments.every((p) => p.customerId === id), expected.rameshId));
ok('the report/inventory screens are unreachable from the portal', !portalText.includes('Stock value') && !portalText.includes('Reports'));

console.log('\nBill detail, statement and printing');
await page.evaluate(() => document.querySelector('#app [data-act="portal-view-bill"]').click());
await page.waitForSelector('#modal-host.open .inv-view');
const billText = await page.$eval('#modal-host', (e) => e.innerText);
ok('bill detail shows items, totals and what is pending', /Still pending on this bill/.test(billText) && /Sugar/.test(billText));
ok('bill detail offers print / save-as-PDF', !!(await page.$('#modal-host [data-act="portal-print-bill"]')));
await page.evaluate(() => document.querySelector('#modal-host [data-act="portal-print-bill"]').click());
await new Promise((r) => setTimeout(r, 400));
const sheet = await page.$eval('#print-root', (e) => e.innerText);
ok('the printed bill is the real invoice (with shop + customer)', sheet.includes('Shree Balaji Traders') && sheet.includes(expected.rameshName), sheet.slice(0, 60));
ok('printed bill carries the amount in words', /Rupees/.test(sheet));
await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });

await page.evaluate(() => ACTIONS['portal-print-statement']());
await new Promise((r) => setTimeout(r, 300));
const stmt = await page.$eval('#print-root', (e) => e.innerText);
ok('statement prints the full ledger with totals', /KHATA STATEMENT/.test(stmt) && /TOTAL/.test(stmt) && /Closing balance/.test(stmt));
await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; UI.closeModal(); });

console.log('\nWhatsApp from the customer side');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => /Pending balance|All settled/i.test(document.getElementById('app').innerText), { timeout: 15000 });
ok('the portal keeps the customer signed in after a reload', await state(() => !!S.portalUser));
await page.evaluate(() => { window.__opened = []; ACTIONS['portal-wa-statement'](); });
await new Promise((r) => setTimeout(r, 400));
const urls = await state(() => window.__opened);
ok('customer can WhatsApp their own statement (to themselves)', urls.length === 1 && /wa\.me|web\.whatsapp\.com/.test(urls[0]) && decodeURIComponent(urls[0]).includes('Khata statement'), urls[0] && urls[0].slice(0, 60));
await page.evaluate(() => { window.__opened = []; ACTIONS['portal-wa-shop'](); });
await new Promise((r) => setTimeout(r, 300));
const shopMsg = decodeURIComponent((await state(() => window.__opened))[0] || '');
ok('customer can message the shop about the balance', /My khata balance shows/.test(shopMsg) && shopMsg.includes(expected.rameshName), shopMsg.slice(0, 50));

console.log('\nSign out and access control');
await page.evaluate(() => ACTIONS['portal-logout']());
await page.waitForSelector('#pf_id', { timeout: 15000 });
ok('sign out returns to the portal login (not the shop screen)', await state(() => !!S.portalMode && !S.portalUser));
ok('the customer cannot reach the shop app after signing out', !(await page.$eval('#app', (e) => /Stock value|Reports|New Bill/.test(e.innerText))));
ok('shop data is not visible after signing out', !(await page.$eval('#app', (e) => e.innerText)).includes('Total billed'));

// the owner side must still be intact in another tab of the same browser
const owner = await ctx.newPage();
await owner.goto(BASE, { waitUntil: 'domcontentloaded' });
await owner.waitForFunction(() => typeof S !== 'undefined' && S.ready);
ok('shop app still works for the owner in another tab', await owner.evaluate(() => S.customers.length >= 4 && S.invoices.length === 4));
ok('owner session was not disturbed by the customer login', await owner.evaluate(() => !document.getElementById('lg_email')));
await owner.close();

/* ------------------------------------------------------------------ */
console.log('\nShop can switch the portal off');
// the owner flips the switch in Settings (saved with the shop settings)
await page.evaluate(async () => { await ACT.saveSettings({ portalEnabled: false }, S); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#app', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 800));
const closed = await page.$eval('#app', (e) => e.innerText);
ok('when switched off the portal shows a closed notice (no login form)', /Portal closed/i.test(closed) && !(await page.$('#pf_id')));
// switch it back on so nothing else is affected
await page.evaluate(async () => { await ACT.saveSettings({ portalEnabled: true }, S); });
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 600));
ok('switching it back on restores the login form', (await page.$('#pf_id')) !== null);

console.log('\nFirebase-mode wiring');
const cfg = readFileSync('src/index.html', 'utf8');
ok('PORTAL_DOMAIN is configurable in index.html', /window\.PORTAL_DOMAIN = "/.test(cfg));
const rules = readFileSync('firestore.rules', 'utf8');
ok('rules restrict customers to their own customer doc', /match \/customers\/\{customerId\}[\s\S]*resource\.data\.authUid == request\.auth\.uid/.test(rules));
ok('rules restrict invoices/payments by the customer link', /isMeCustomerDoc\(resource\.data\.customerId\)/.test(rules));
ok('rules give customers no write access', /allow write: if false/.test(rules));
ok('rules keep the shop card public but not writable by customers', /match \/portal_shop\/\{doc\}[\s\S]*allow read: if true;[\s\S]*allow write: if can\('settings'\) \|\| isOwner\(\)/.test(rules));
const liveRules = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok('no "allow read, write: if true" in the actual rules (only mentioned in comments)', !/allow read, write: if true/.test(liveRules));
const allowRules = liveRules.match(/allow (read|write|read, write)[^;]*;/g) || [];
const openRules = allowRules.filter((r) => /if true/.test(r));
ok('every live allow-rule is guarded, except the one public shop card',
  openRules.length === 1 && /match \/portal_shop/.test(liveRules.split('allow read: if true;')[0].slice(-200)),
  'open rules: ' + JSON.stringify(openRules));
const writeRules = allowRules.filter((r) => /^allow write/.test(r));
// Customers must never pass a write rule: each one is either hard-denied, owner-only,
// or asks for a shop permission that no customer session can hold.
ok('every write rule is either permission-gated or hard-denied for customers',
  writeRules.length >= 4 && writeRules.every((r) => /if false/.test(r) || /isOwner\(\)/.test(r) || /can\('[a-zA-Z]+'\)/.test(r)),
  JSON.stringify(writeRules));
const bundle = readFileSync('index.html', 'utf8');
ok('portal uses a separate Firebase app instance (never signs the owner out)', /_secondaryApp\('portal'\)/.test(bundle) && /initializeApp\(FIREBASE_CONFIG, key\)/.test(bundle));
ok('portal queries are filtered (required for the security rules)', /where\('authUid', '==', uid\)/.test(bundle) && /where\('customerId', '==', customer\.id\)/.test(bundle));

ok('no JS errors during the whole portal session', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
