/**
 * Live-site check — runs the deployed app in a real browser and reports anything broken.
 *
 *   node tests/live.mjs                                  → checks https://noamzaki.github.io/noamzaki/
 *   node tests/live.mjs http://localhost:8099/index.html → checks any other URL
 *
 * It does NOT touch your data: it only signs in with a deliberately wrong password
 * (to prove Firebase Auth answers) and opens the customer portal login page.
 * Needs Chrome: bash tools/setup-chrome.sh, then LD_LIBRARY_PATH=$PWD/.cache/chromelibs node tests/live.mjs
 */
import puppeteer from 'puppeteer';

const URL_BASE = process.argv[2] || 'https://noamzaki.github.io/noamzaki/';
const SITE = URL_BASE.replace(/\/index\.html$/, '/');
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? ' → ' + extra : ''))); };

const browser = await puppeteer.launch({
  headless: true, protocolTimeout: 180000,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

/* Things that are EXPECTED in this run and must not be reported as app errors:
   - our own deliberately-wrong login (Firebase Auth answers HTTP 400)
   - the Firestore SDK's listen/write channel being aborted/retried (normal long-polling) */
const EXPECTED = [
  /identitytoolkit\.googleapis\.com/i,
  /firestore\.googleapis\.com\/.*\/channel/i,
  /firestore\.googleapis\.com\/google\.firestore\.v1\.Firestore/i,
  /favicon/i
];
const isExpected = (text) => EXPECTED.some((re) => re.test(String(text)));

/** open a page and collect console errors / page errors / failed requests */
async function open(url, ctx) {
  const page = ctx ? await ctx.newPage() : await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 1000 });
  const errors = [], warnings = [], failed = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    const where = (m.location && m.location() && m.location().url) || '';
    if (m.type() === 'error') { if (!isExpected(t) && !isExpected(where)) errors.push('console: ' + t + (where ? ' @ ' + where.slice(0, 80) : '')); }
    else if (m.type() === 'warning') warnings.push(t);
  });
  page.on('requestfailed', (r) => { if (!isExpected(r.url())) failed.push(`${r.failure().errorText} ${r.url().slice(0, 120)}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !isExpected(r.url())) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, errors, warnings, failed };
}

console.log('\nLoading ' + SITE);
const { page, errors, failed } = await open(SITE);
await page.waitForFunction(() => typeof S !== 'undefined' && (S.ready || document.getElementById('lg_email') || document.getElementById('ob_name')), { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));            // let Firebase connect / SW settle

const boot = await page.evaluate(() => ({
  mode: DB.mode,
  online: DB.online,
  configured: DB.isConfigured(),
  project: FIREBASE_CONFIG.projectId,
  sdkLoaded: !!(window.__fbSdkProbe || DB._fb),
  loginScreen: !!document.getElementById('lg_email'),
  onboarding: !!document.getElementById('ob_name'),
  banner: (document.querySelector('.banner, .conn') || {}).innerText || '',
  sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller)
}));
ok('page loads and the app boots', true);
ok('Firebase config is present in the deployed page', boot.configured && boot.project === 'noamzaki-shop', JSON.stringify(boot));
ok('Firebase SDK loaded (app talks to the cloud, not local mode)', boot.mode === 'firebase', 'mode=' + boot.mode);
ok('it shows the sign-in screen (owner account needed)', boot.loginScreen || boot.onboarding);
ok('no "Local mode" banner', !/Local mode/i.test(boot.banner), boot.banner.slice(0, 80));

/* ---- Firebase Auth really answers: deliberately wrong password ---- */
await page.evaluate(() => {
  const e = document.getElementById('lg_email'), p = document.getElementById('lg_pass');
  if (e) e.value = 'definitely-not-a-user@example.com';
  if (p) p.value = 'wrongpassword123';
});
await page.evaluate(() => document.querySelector('[data-act="login"]').click());
const authErr = await page.waitForFunction(() => {
  const el = document.querySelector('.err');
  return el && el.innerText.trim() ? el.innerText.trim() : false;
}, { timeout: 25000 }).then((h) => h.jsonValue()).catch(() => '');
ok('a wrong login is refused with a readable message (Auth is reachable)', /invalid|wrong|not found|password/i.test(authErr), authErr.slice(0, 90));
ok('the shop data is NOT shown to a failed login', !(await page.evaluate(() => /INV-|Khata|Dashboard/i.test(document.getElementById('app').innerText))));

/* ---- customer portal route ---- */
const portal = await open(SITE + '#customer');
await portal.page.waitForFunction(() => document.querySelector('#pf_id') || document.querySelector('.portal-login-card'), { timeout: 25000 });
await new Promise((r) => setTimeout(r, 1500));
const pstate = await portal.page.evaluate(() => ({
  loginForm: !!document.getElementById('pf_id'),
  rulesNotice: /rules are not ready|not ready/i.test(document.body.innerText),
  shopName: (document.querySelector('.portal-brand b') || {}).innerText || '',
  err: document.querySelector('.err') ? document.querySelector('.err').innerText : ''
}));
ok('customer portal page loads with its login form', pstate.loginForm, JSON.stringify(pstate));
ok('portal does not show a rules/permission error before any shop data exists', !pstate.rulesNotice, pstate.err || pstate.shopName);

/* ---- the ?local=1 demo link (documented in the README) ----
   Tested in its own browser context, i.e. exactly what a new visitor sees. */
const demoCtx = await browser.createBrowserContext();
const demo = await open(SITE + '?local=1', demoCtx);
await demo.page.waitForFunction(() => typeof S !== 'undefined' && (S.ready || document.getElementById('ob_name')), { timeout: 30000 });
// the onboarding dialog opens a moment after the app is ready — give it that moment
await demo.page.waitForFunction(() => !!document.getElementById('ob_name'), { timeout: 8000 }).catch(() => { });
const demoState = await demo.page.evaluate(() => ({
  mode: DB.mode,
  onboarding: !!document.getElementById('ob_name'),
  login: !!document.getElementById('lg_email'),
  banner: (document.querySelector('.banner, .conn') || {}).innerText || ''
}));
ok('the ?local=1 demo link opens a fresh shop on the device (no cloud)', demoState.mode === 'local' && demoState.onboarding && !demoState.login, JSON.stringify(demoState));
ok('it says so plainly (Local mode banner)', /Local mode/i.test(demoState.banner), demoState.banner.slice(0, 70));
ok('no errors on the demo link either', demo.errors.length === 0, demo.errors.slice(0, 2).join(' | '));

/* ---- static assets ---- */
const asset = async (p) => (await page.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).status, p));
ok('index.html served', (await asset(SITE + 'index.html')) === 200);
ok('sw.js served (offline support)', (await asset(SITE + 'sw.js')) === 200);
ok('firestore.rules served (easy to copy from the repo)', (await asset(SITE + 'firestore.rules')) === 200);

/* ---- errors ---- */
const realErrors = errors.filter((e) => !isExpected(e));
ok('no JavaScript errors on the live site', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
ok('no failed requests / 404s (apart from the wrong-login we caused)', failed.length === 0, failed.slice(0, 3).join(' | '));
ok('no errors on the customer portal page either', portal.errors.length === 0, portal.errors.slice(0, 3).join(' | '));

try { await page.screenshot({ path: 'screenshots/25-live-login.png', captureBeyondViewport: false }); } catch (e) { console.log('  (screenshot skipped: ' + e.message.split('\n')[0] + ')'); }
try { await portal.page.screenshot({ path: 'screenshots/26-live-portal.png', captureBeyondViewport: false }); } catch (e) { }
await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
