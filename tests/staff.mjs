/**
 * Staff + permissions tests.  node tests/staff.mjs   (needs the static server on :8099)
 *
 * Runs in Local mode using the owner-password + staff-login feature, which is the
 * same permission engine the Firebase logins use (permsForRole / can() / requirePerm).
 * Checks that each role sees only its screens, that money figures stay hidden,
 * and that blocked actions are refused even when triggered directly (bypassing the UI).
 */
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:8099/index.html?local=1';
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? ' → ' + extra : ''))); };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const state = (fn, ...a) => page.evaluate(fn, ...a);

/* One browser context per person, so each has its own sign-in (sessionStorage is per page).
   Local-mode data lives in localStorage, which is NOT shared between contexts — so each
   context is seeded with a snapshot of the owner's device before the page loads. */
let seed = {};
async function snapshot() {
  seed = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  return seed;
}
async function openApp(ctx) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.setViewport({ width: 1280, height: 1000 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.errs = errs;
  if (Object.keys(seed).length) {
    await p.evaluateOnNewDocument((s) => { Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); }, seed);
  }
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  return p;
}
const tabsVisible = (p) => p.$$eval('.nav-item', (els) => els.map((e) => e.innerText.trim()));
async function closeModal(p) {
  const open = await p.evaluate(() => document.getElementById('modal-host').classList.contains('open'));
  if (!open) return;
  await p.evaluate(() => UI.closeModal());
}

/* ------------------------------------------------------------------ */
console.log('\nOwner sets up the shop, then adds staff');
const ownerCtx = await browser.createBrowserContext();
const page = await openApp(ownerCtx);
await page.waitForSelector('#ob_name');
await page.type('#ob_name', 'Shree Balaji Traders');
await page.type('#ob_phone', '9876543210');
await page.click('[data-act="onboard-save"]');
await page.waitForFunction(() => typeof S !== 'undefined' && S.products.length === 10);
ok('owner starts in the app without a login (no owner password yet)', await state(() => isOwnerSession()));

// a couple of bills so reports/cost have something to show
await page.evaluate(async () => {
  const c = S.customers[0];
  const mk = (q, qty) => ({ productId: q.id, name: q.name, unit: q.unit, sellUnit: 'unit', ppb: 1, qty, rate: num(q.price), discPct: 0, gstPct: num(q.gst), cost: num(q.cost) });
  S.bill = blankBill(); S.bill.customerId = c.id; S.bill.no = nextBillNo();
  S.bill.lines = [mk(S.products[0], 10), mk(S.products[3], 2)];
  S.bill.paidNow = 200;
  await ACTIONS['bill-save']();
  UI.closeModal();
  render();
});

console.log('\nOwner adds staff logins');
await page.evaluate(() => { S.tab = 'staff'; render(); });
await page.waitForSelector('[data-act="staff-modal"]');
await page.click('[data-act="staff-modal"]');
await page.waitForSelector('#sf_name');
ok('staff dialog shows role presets with descriptions', /Counter \+ Stock/.test(await page.$eval('#sf_role', (e) => e.innerText)));
ok('permissions are listed in groups', /Make bills/.test(await page.$eval('#sf_perms', (e) => e.innerText)) && /See purchase cost/.test(await page.$eval('#sf_perms', (e) => e.innerText)));
const counterPerms = await page.$$eval('#sf_perms input[type=checkbox]', (els) => els.filter((e) => e.checked).map((e) => e.dataset.perm));
ok('Counter+Stock preset ticks billing/payment/khata/stock only',
  JSON.stringify(counterPerms.sort()) === JSON.stringify(['bill', 'khata', 'payment', 'stock']), counterPerms.join(','));

async function addStaff({ name, email, password, role }) {
  await page.evaluate(() => { if (!document.getElementById('sf_name')) document.querySelector('[data-act="staff-modal"]').click(); });
  await page.waitForSelector('#sf_name');
  await page.evaluate(() => { ['sf_name', 'sf_email', 'sf_pass'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; }); });
  await page.type('#sf_name', name);
  await page.type('#sf_email', email);
  await page.type('#sf_pass', password);
  await page.select('#sf_role', role);
  await page.click('#modal-host [data-act="staff-save"]');
  await page.waitForFunction((em) => (S.staff || []).some((x) => x.email === em), { timeout: 10000 }, email);
}
await addStaff({ name: 'Suresh (counter)', email: 'suresh@shop.com', password: 'counter123', role: 'counter' });
const suresh = await state(() => S.staff.find((x) => x.email === 'suresh@shop.com'));
ok('staff login created and stored', !!suresh && suresh.role === 'counter');
ok('staff password is hashed, never stored in clear', !JSON.stringify(suresh).includes('counter123') && /^(sha256|djb2):/.test(suresh.pinHash));
ok('permissions are resolved from the role', await state((id) => { const st = S.staff.find((x) => x.id === id); const p = permsForRole(st.role, st.customPerms); return p.bill && p.payment && p.stock && !p.reports && !p.cost && !p.deleteBill && !p.settings; }, suresh.id));
await closeModal(page);
await page.evaluate(() => { S.tab = 'staff'; render(); });
await page.waitForSelector('.row .perm-line');
ok('staff list shows what each person may do', /Make bills/.test(await page.$eval('.perm-line', (e) => e.innerText)));
await page.screenshot({ path: 'screenshots/22-staff-list.png', fullPage: true });

// a custom-role staffer who can ONLY look at stock (to test custom permissions)
await addStaff({ name: 'Ganesh (store)', email: 'ganesh@shop.com', password: 'store12345', role: 'store' });
await closeModal(page);
console.log('\nOwner sets a password for this device');
await page.evaluate(() => { S.tab = 'staff'; render(); });
await page.click('[data-act="staff-owner-password"]');
await page.waitForSelector('#op_email');
await page.evaluate(() => { document.getElementById('op_email').value = 'owner@shop.com'; document.getElementById('op_pass').value = 'ownerpass123'; });
await page.click('[data-act="staff-owner-password-save"]');
await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('wb_owner_auth') || 'null'), { timeout: 5000 });
ok('owner password saved in its own local key (never synced to the cloud)', await state(async () => await LOCAL_AUTH.ownerPasswordSet()));
ok('the password is a hash, not the plain text', await state(() => {
  const raw = localStorage.getItem('wb_owner_auth');
  return !raw.includes('ownerpass123') && /^(sha256|djb2):/.test(JSON.parse(raw).hash);
}));
ok('a settings save does not wipe the owner password', await state(async () => {
  await ACT.saveSettings({ lowStockDefault: 7 }, S);
  return await LOCAL_AUTH.ownerPasswordSet();
}));

/* ------------------------------------------------------------------ */
console.log('\nOwner signs in (owner role = everything)');
await snapshot();                       // the shop as it sits on the owner's device
const owner2 = await openApp(await browser.createBrowserContext());
await owner2.waitForSelector('#lg_email');
ok('login screen appears once an owner password is set', true);
await owner2.type('#lg_email', 'owner@shop.com');
await owner2.type('#lg_pass', 'ownerpass123');
await owner2.click('[data-act="login"]');
await owner2.waitForFunction(() => typeof S !== 'undefined' && S.ready && !!S.session, { timeout: 15000 });
ok('owner is signed in as owner', await owner2.evaluate(() => isOwnerSession() && S.session.role === 'owner'));
ok('owner sees every screen', (await tabsVisible(owner2)).length === 9, (await tabsVisible(owner2)).join(','));
ok('owner sees reports + cost + staff', await owner2.evaluate(() => can('reports') && can('cost') && can('staff') && can('data')));
await owner2.screenshot({ path: 'screenshots/23-owner-session.png' });
ok('wrong owner password is refused', await (async () => {
  const p = await openApp(await browser.createBrowserContext());
  await p.waitForSelector('#lg_email');
  await p.type('#lg_email', 'owner@shop.com');
  await p.type('#lg_pass', 'nope');
  await p.click('[data-act="login"]');
  await p.waitForSelector('.err', { timeout: 8000 });
  const bad = /Wrong password/i.test(await p.$eval('.err', (e) => e.innerText));
  await p.close();
  return bad;
})());

/* ------------------------------------------------------------------ */
console.log('\nCashier-ish staff (Counter + Stock) signs in');
const cashier = await openApp(await browser.createBrowserContext());
await cashier.waitForSelector('#lg_email');
await cashier.type('#lg_email', 'suresh@shop.com');
await cashier.type('#lg_pass', 'counter123');
await cashier.click('[data-act="login"]');
await cashier.waitForFunction(() => typeof S !== 'undefined' && S.ready && !!S.session, { timeout: 15000 });
const ct = await cashier.evaluate(() => ({ role: S.session.role, name: S.session.name, isOwner: S.session.isOwner }));
ok('staff session resolves with their role and name', ct.role === 'counter' && ct.name === 'Suresh (counter)' && ct.isOwner === false, JSON.stringify(ct));
const cashierTabs = await tabsVisible(cashier);
ok('nav shows only allowed tabs (no Reports/Settings/Staff)', !cashierTabs.includes('Reports') && !cashierTabs.includes('Settings') && !cashierTabs.includes('Staff'), cashierTabs.join(','));
ok('allowed tabs are there (Home/New Bill/Khata/Payment/Stock/Bills)', ['Home', 'New Bill', 'Khata', 'Payment', 'Stock', 'Bills'].every((t) => cashierTabs.includes(t)), cashierTabs.join(','));
ok('header shows who is signed in', /Suresh/.test(await cashier.$eval('.who', (e) => e.innerText)));
await cashier.screenshot({ path: 'screenshots/24-staff-session.png', fullPage: true });

console.log('\nStaff cannot reach blocked screens, even by forcing the tab');
await cashier.evaluate(() => { S.tab = 'reports'; render(); });
await cashier.waitForSelector('.empty');
ok('Reports screen is refused with a "No access" message', /No access/i.test(await cashier.$eval('#view', (e) => e.innerText)));
await cashier.evaluate(() => { S.tab = 'settings'; render(); });
ok('Settings screen is refused', /No access/i.test(await cashier.$eval('#view', (e) => e.innerText)));
await cashier.evaluate(() => { S.tab = 'staff'; render(); });
ok('Staff screen is refused', /Only the owner can manage staff|No access/i.test(await cashier.$eval('#view', (e) => e.innerText)));

console.log('\nMoney figures the cashier may not see are hidden');
await cashier.evaluate(() => { S.tab = 'dash'; render(); });
const dash = await cashier.$eval('#view', (e) => e.innerText);
ok("today's sales figure is not shown (no reports permission)", !/TODAY'S SALES/i.test(dash), dash.split('\n').slice(0, 6).join(' | '));
ok('bills count is shown instead (they can still work)', /BILLS TODAY/i.test(dash));
ok('collect button is available (has payment permission)', !!(await cashier.$('[data-act="pay-modal"]')));
await cashier.evaluate(() => { S.tab = 'products'; render(); });
const prodText = await cashier.$eval('#view', (e) => e.innerText);
ok('stock value / margin is hidden from staff without the cost permission', !/STOCK VALUE/i.test(prodText) && !/margin/i.test(prodText));
ok('item prices and stock quantities are still visible for billing', /₹/.test(prodText) && /stock/i.test(prodText));
await cashier.evaluate(() => { S.tab = 'invoices'; render(); });
const invText = await cashier.$eval('#view', (e) => e.innerText);
ok('bills list is available (needed for reprints)', /INV-0001/.test(invText));
ok('edit (pencil) button is hidden for staff who cannot edit bills', !(await cashier.$('[data-act="edit-invoice"]')));

/* ------------------------------------------------------------------ */
console.log('\nBlocked actions are refused even when triggered directly');
const guarded = await cashier.evaluate(async () => {
  const before = { invoices: S.invoices.length, payments: S.payments.length, products: S.products.length, staff: (S.staff || []).length };
  const inv = S.invoices[0];
  await ACTIONS['del-invoice']({ dataset: { id: inv.id } });          // needs deleteBill
  await ACTIONS['edit-invoice']({ dataset: { id: inv.id } });
  await ACTIONS['pay-save']();                                       // needs payment (no form filled → also refuses)
  await ACTIONS['del-payment']({ dataset: { id: (S.payments[0] || {}).id } });
  await ACTIONS['wipe-data']();                                      // needs data
  await ACTIONS['staff-modal']();                                    // needs staff
  await ACTIONS['staff-toggle']({ dataset: { id: 'anything' } });
  await ACTIONS['set-bool']({ dataset: { f: 'taxEnabled' }, checked: false, type: 'checkbox' });
  const after = { invoices: S.invoices.length, payments: S.payments.length, products: S.products.length, staff: (S.staff || []).length, tax: S.settings.taxEnabled };
  return { before, after, toast: document.getElementById('toasts').innerText };
});
ok('bills cannot be deleted by staff', guarded.before.invoices === guarded.after.invoices);
ok('bills cannot be put into edit mode by staff', await cashier.evaluate(() => !S.bill || S.bill._editing !== true));
ok('payments cannot be deleted by staff', guarded.before.payments === guarded.after.payments);
ok('shop-wide wipe is refused', guarded.after.products > 0);
ok('settings cannot be changed by staff', guarded.after.tax === true);
ok('the refusal is explained to the user', /Only the owner has permission/i.test(guarded.toast), guarded.toast.split('\n')[0]);

console.log('\nBut the work they are allowed to do still works');
const allowed = await cashier.evaluate(async () => {
  const c = S.customers[0];
  S.bill = blankBill(); S.bill.customerId = c.id; S.bill.no = nextBillNo();
  addProductLine(S.products[0], 5);
  const before = { inv: S.invoices.length, stock: num(S.products[0].stock) };
  await ACTIONS['bill-save']();
  const afterBill = { inv: S.invoices.length, stock: num(S.products[0].stock), by: S.invoices[S.invoices.length - 1].createdByName };
  UI.closeModal();
  await ACT.savePayment({ id: uid('pay'), customerId: c.id, customerName: c.name, amount: 250, date: todayISO(), mode: 'Cash', note: '', invoiceId: '' }, S);
  return { before, afterBill, pays: S.payments.length };
});
ok('staff can make a bill', allowed.afterBill.inv === allowed.before.inv + 1);
ok('stock is deducted for their bill too', allowed.afterBill.stock === allowed.before.stock - 5, `${allowed.before.stock} → ${allowed.afterBill.stock}`);
ok('the bill records who billed it', allowed.afterBill.by === 'Suresh (counter)', allowed.afterBill.by);
ok('their own payment recording is not blocked by the guard', allowed.pays >= 1);

/* ------------------------------------------------------------------ */
console.log('\nStore keeper (custom preset): stock only');
const store = await openApp(await browser.createBrowserContext());
await store.waitForSelector('#lg_email');
await store.type('#lg_email', 'ganesh@shop.com');
await store.type('#lg_pass', 'store12345');
await store.click('[data-act="login"]');
await store.waitForFunction(() => typeof S !== 'undefined' && S.ready && !!S.session, { timeout: 15000 });
const storeTabs = await tabsVisible(store);
ok('store keeper sees Stock + Khata only', storeTabs.includes('Stock') && storeTabs.includes('Khata') && !storeTabs.includes('New Bill') && !storeTabs.includes('Payment'), storeTabs.join(','));
ok('store keeper can add stock', await store.evaluate(async () => {
  const p = S.products[1];
  const before = num(p.stock);
  await ACT.stockIn({ productId: p.id, qty: 2, sellUnit: 'box', cost: 120, date: todayISO(), supplier: 'test', note: '', type: 'purchase' }, S);
  return num(S.products.find((x) => x.id === p.id).stock) === before + 2 * num(p.ppb);
}));
ok('store keeper cannot make a bill', await store.evaluate(async () => {
  const before = S.invoices.length;
  S.bill = blankBill(); addProductLine(S.products[0], 1);
  await ACTIONS['bill-save']();
  return S.invoices.length === before;
}));
ok('store keeper cannot delete a bill either', await store.evaluate(async () => {
  const before = S.invoices.length;
  await ACTIONS['del-invoice']({ dataset: { id: S.invoices[0].id } });
  return S.invoices.length === before;
}));

console.log('\nSwitching a staff member off blocks their login');
await owner2.evaluate(async () => {
  const st = S.staff.find((x) => x.email === 'ganesh@shop.com');
  st.active = false;
  await ACT.save('staff', st, S, true);
});
await page.evaluate((st) => {
  // the owner's device shows the change too (the snapshot above was taken before it)
  const d = DB._readLocal() || {};
  d.staff = (d.staff || []).map((x) => (x.email === 'ganesh@shop.com' ? st : x));
  localStorage.setItem('wholesale_billing_v1', JSON.stringify(d));
}, await owner2.evaluate(() => S.staff.find((x) => x.email === 'ganesh@shop.com')));
await snapshot();
const blocked = await openApp(await browser.createBrowserContext());
await blocked.waitForSelector('#lg_email');
await blocked.type('#lg_email', 'ganesh@shop.com');
await blocked.type('#lg_pass', 'store12345');
await blocked.click('[data-act="login"]');
await blocked.waitForSelector('.err', { timeout: 10000 });
ok('a switched-off login cannot sign in', /switched off/i.test(await blocked.$eval('.err', (e) => e.innerText)));

console.log('\nUnknown login is refused');
await blocked.evaluate(() => { document.getElementById('lg_email').value = 'stranger@shop.com'; document.getElementById('lg_pass').value = 'x'.repeat(8); });
await blocked.click('[data-act="login"]');
await blocked.waitForSelector('.err', { timeout: 10000 });
ok('an unknown email gets nowhere', /No login with that ID|Wrong password/i.test(await blocked.$eval('.err', (e) => e.innerText)));

/* ------------------------------------------------------------------ */
console.log('\nSign out returns to the login screen');
await cashier.evaluate(() => { window.confirm = () => true; ACTIONS['log-out'](); });
await cashier.waitForSelector('#lg_email', { timeout: 10000 });
ok('staff can sign out and hand the PC over', true);
ok('shop data is gone from the screen after sign out', !(await cashier.$eval('#app', (e) => /INV-0001/.test(e.innerText))));

/* ------------------------------------------------------------------ */
console.log('\nSecurity rules carry the same permissions');
const rules = readFileSync('firestore.rules', 'utf8');
const bundle = readFileSync('index.html', 'utf8');
const live = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok('rules define isOwner from settings.ownerUids', /function isOwner\(\)[\s\S]*ownerUids\(\)/.test(live));
ok('rules define per-permission can() from the staff document', /function can\(perm\)[\s\S]*staffDoc\(\)\.perms\[perm\] == true/.test(live));
ok('rules require an active staff doc', /staffDoc\(\)\.active == true/.test(live));
ok('products can only be changed with the stock permission', /match \/products\/\{doc\}[\s\S]*allow write: if can\('stock'\)/.test(live));
ok('invoices can only be deleted with the deleteBill permission', /match \/invoices\/\{doc\}[\s\S]*allow delete: if can\('deleteBill'\)/.test(live));
ok('editing an existing bill needs deleteBill too (rules match the hidden button)', /allow update: if can\('deleteBill'\)/.test(live));
ok('payments cannot be updated at all (audit trail)', /match \/payments\/\{doc\}[\s\S]*allow update: if false/.test(live));
ok('settings are owner-only to change', /match \/settings\/\{doc\}[\s\S]*allow update, delete: if isOwner\(\)/.test(live));
ok('staff documents are owner-only to write', /match \/staff\/\{uid\}[\s\S]*allow write: if isOwner\(\)/.test(live));
ok('customers can still only read their own portal record', /resource\.data\.authUid == request\.auth\.uid/.test(live));
ok('no unguarded read/write rule was left behind', !/allow read, write: if true/.test(live));
ok('the owner is recorded in settings.ownerUids (used by isOwner in the rules)',
  /ownerUids/.test(live) && /ownerUids/.test(bundle));
ok('staff logins are created through a second Firebase app so the owner is never signed out',
  /_secondaryApp\('staff-admin-/.test(bundle));
ok('Firebase sign-in resolves the staff document and blocks switched-off logins',
  /staff\/disabled/.test(bundle) && /staff\/not-enabled/.test(bundle) && /roleById\(/.test(bundle));
ok('the compiled page contains the permission engine (one can() / requirePerm)',
  /function can\(perm\)/.test(bundle) && /function requirePerm\(/.test(bundle));

ok('no JS errors in any staff session', page.errs.length === 0 && owner2.errs.length === 0 && cashier.errs.length === 0 && store.errs.length === 0,
  [].concat(page.errs, owner2.errs, cashier.errs, store.errs).slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
