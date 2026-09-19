/* =========================================================================
   BOOT — startup, login, first-run onboarding, demo data, misc
   ========================================================================= */

S.authRequired = false;
S.bootError = '';

/* Safety net: actions are normally triggered by a click, so they can read
   el.dataset. Programmatic / keyboard triggers may not pass an element —
   give every action a harmless placeholder so nothing throws. */
Object.keys(ACTIONS).forEach((name) => {
  const fn = ACTIONS[name];
  ACTIONS[name] = (el, ev) => fn(el && el.dataset ? el : document.createElement('span'), ev);
});

function renderLogin() {
  clearShell();
  const localMode = DB.mode !== 'firebase';
  document.getElementById('app').innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="logo big">₹</div>
        <h1>${esc(S.settings.shopName && S.settings.shopName !== DEFAULT_SETTINGS.shopName ? S.settings.shopName : 'Wholesale Store Billing')}</h1>
        <p class="muted">${localMode ? 'Sign in with your login on this device' : 'Sign in to open your shop data'}</p>
        ${S.loginError ? `<div class="err">${esc(S.loginError)}</div>` : ''}
        <label class="fld"><span>Email</span><input id="lg_email" type="email" autocomplete="username" placeholder="you@shop.com"></label>
        <label class="fld"><span>Password</span><input id="lg_pass" type="password" autocomplete="current-password" placeholder="••••••••"></label>
        <button class="btn primary big" data-act="login">Sign in</button>
        <button class="btn ghost" data-act="forgot">Forgot password?</button>
        ${S.bootError ? `<div class="err small">${esc(S.bootError)}</div>` : ''}
      </div>
      ${S.sessionMessage ? `<div class="warn-box">${icon('warn')}<span>${esc(S.sessionMessage)}</span></div>` : ''}
      <p class="login-foot">${localMode ? 'Local mode · logins are checked on this device' : 'Firebase · ' + esc(FIREBASE_CONFIG.projectId || '') + ' · data stays in your project'}</p>
      <p class="login-foot"><a href="#customer">Customer? Check your balance →</a></p>
    </div>`;
}
ACTIONS['login'] = async () => {
  const email = document.getElementById('lg_email').value.trim();
  const pass = document.getElementById('lg_pass').value;
  if (!email || !pass) { S.loginError = 'Enter email and password'; renderLogin(); return; }
  S.loginError = '';
  S.sessionMessage = '';
  renderLogin();
  if (DB.mode !== 'firebase') {
    try {
      S.session = await LOCAL_AUTH.login(email, pass);
      await afterSession();
    } catch (e) {
      S.loginError = e.message || 'Could not sign you in';
      renderLogin();
    }
    return;
  }
  try {
    await DB.login(email, pass);          // the auth callback continues the sign-in
  } catch (e) {
    const messages = {
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong password.',
      'auth/user-not-found': 'No user with this email. Create the user in Firebase → Authentication → Users.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'No internet connection.',
      'auth/invalid-email': 'That email address looks wrong.',
      'auth/invalid-api-key': 'Firebase rejected the key — check the config block at the top of index.html.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase rejected the API key. Re-copy it from Firebase → Project settings → Your apps, and check the key is not restricted to other domains.',
      'auth/configuration-not-found': 'Email/Password sign-in is not enabled. Firebase → Authentication → Sign-in method → enable Email/Password.',
      'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in your Firebase project.',
      'auth/unauthorized-domain': 'This website domain is not authorised. Firebase → Authentication → Settings → Authorized domains → add it.'
    };
    S.loginError = messages[e.code] || ('Sign-in problem: ' + (e.code || e.message));
    renderLogin();
  }
};
ACTIONS['forgot'] = async () => {
  const email = document.getElementById('lg_email').value.trim();
  if (!email) { S.loginError = 'Type your email first, then tap again'; renderLogin(); return; }
  try { await DB.sendReset(email); S.loginError = ''; UI.toast('Password reset email sent'); }
  catch (e) { S.loginError = 'Could not send reset mail: ' + (e.code || e.message); renderLogin(); }
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('lg_pass') === document.activeElement) ACTIONS['login']();
});

ACTIONS['log-out'] = async () => {
  if (!confirm('Sign out' + (S.session && !S.session.isOwner ? ' of ' + sessionLabel() + '?' : '?'))) return;
  try {
    if (DB.mode === 'firebase') await DB.logout();
  } catch (e) { }
  S.session = null;
  S.ready = false;
  try { sessionStorage.removeItem('wb_session'); } catch (e) { }
  S.authRequired = true;
  UI.modal = null;
  renderLogin();
};

/* After a session is resolved (either mode) load the shop data and draw the app */
async function afterSession() {
  S.authRequired = false;
  S.sessionMessage = '';
  if (DB.mode === 'firebase') {
    await DB.loadAll(onSnapshotData);
  } else {
    await DB.loadAll(onSnapshotData);
    setTimeout(restoreDraft, 300);
  }
  S.tab = canOpenView(S.tab) ? S.tab : 'dash';
  render();
  UI.toast('Welcome, ' + sessionLabel() + (S.session && !S.session.isOwner ? ' · ' + roleById(S.session.role).label : ''), 'ok', 3500);
}

/* ------------------------------ onboarding ------------------------------ */
function onboardingModal() {
  UI.openModal('Welcome! Set up your shop', `
    <div class="form-grid">
      <label class="fld wide"><span>Shop name *</span><input id="ob_name" placeholder="e.g. Shree Balaji Traders"></label>
      <label class="fld"><span>Owner name</span><input id="ob_owner" placeholder="Your name"></label>
      <label class="fld"><span>Phone</span><input id="ob_phone" placeholder="10-digit mobile"></label>
      <label class="fld wide"><span>Address</span><input id="ob_addr" placeholder="Shop address for the bill"></label>
      <label class="fld"><span>GSTIN (if registered)</span><input id="ob_gst"></label>
      <label class="fld"><span>Invoice prefix</span><input id="ob_prefix" value="INV-"></label>
    </div>
    <label class="check"><input type="checkbox" id="ob_demo" checked> Also add 10 demo items + 4 demo customers so I can try it right away</label>
    <p class="note-line">You can change all of this later in Settings. GST can be turned off if you don't bill with tax.</p>
    <div class="modal-actions"><button class="btn primary big" data-act="onboard-save">${icon('check')} Start billing</button></div>`);
}
ACTIONS['onboard-save'] = async () => {
  const name = document.getElementById('ob_name').value.trim();
  if (!name) return UI.toast('Enter your shop name', 'warn');
  await ACT.saveSettings({
    shopName: name,
    ownerName: document.getElementById('ob_owner').value.trim(),
    phone: document.getElementById('ob_phone').value.trim(),
    address: document.getElementById('ob_addr').value.trim(),
    gstin: document.getElementById('ob_gst').value.trim(),
    invoicePrefix: document.getElementById('ob_prefix').value.trim() || 'INV-',
    gstinSet: true,
    seeded: true
  }, S);
  if (document.getElementById('ob_demo').checked) await seedDemo();
  UI.closeModal();
  render();
  UI.toast('Setup done ✓ — create your first bill');
};

/* ------------------------------ demo data ------------------------------ */
const DEMO_PRODUCTS = [
  ['Sugar S-30', 'SUG30', 'Grocery', 'kg', 1, 500, 41, 45, 5, 50],
  ['Toor Dal (Arhar)', 'DAL01', 'Grocery', 'kg', 1, 120, 122, 130, 5, 30],
  ['Basmati Rice', 'RIC02', 'Grocery', 'kg', 1, 200, 86, 95, 5, 40],
  ['Sunflower Oil 1L', 'OIL1L', 'Grocery', 'pcs', 12, 96, 132, 145, 5, 24],
  ['Tata Tea 250g', 'TEA25', 'Beverage', 'pcs', 24, 48, 118, 130, 5, 12],
  ['Detergent Bar 200g', 'DET20', 'Home care', 'pcs', 30, 300, 8.2, 10, 18, 60],
  ['Bath Soap 100g', 'SOP10', 'Home care', 'pcs', 48, 96, 38, 45, 18, 24],
  ['Glucose Biscuit', 'BIS01', 'Snacks', 'pcs', 24, 480, 8, 10, 18, 100],
  ['Iodised Salt 1kg', 'SAL1K', 'Grocery', 'pcs', 24, 120, 18.5, 22, 5, 36],
  ['Milk Powder 500g', 'MIL50', 'Dairy', 'pcs', 12, 36, 238, 260, 18, 12]
];
const DEMO_CUSTOMERS = [
  ['Ramesh Kirana Store', '9820011111', 'Market Road'],
  ['Gupta General Store', '9820022222', 'Station Road'],
  ['Sharma Provision', '9820033333', 'Gandhi Chowk'],
  ['Anand Traders', '9820044444', 'APMC Market']
];

async function seedDemo() {
  const jobs = [];
  for (const [name, code, cat, unit, ppb, stock, cost, price, gst, low] of DEMO_PRODUCTS) {
    const id = uid('prod');
    const p = { id, name, code, category: cat, brand: '', unit, ppb, stock, cost, price, gst, lowStock: low, hsn: '', createdAt: new Date().toISOString() };
    jobs.push(ACT.save('products', p, S, true));
    jobs.push(ACT.save('moves', {
      id: uid('mv'), date: todayISO(), productId: id, productName: name, qty: stock, type: 'purchase',
      refLabel: 'Opening stock (demo)', unit, note: 'Demo data', value: round2(stock * cost), createdAt: new Date().toISOString()
    }, S, true));
  }
  for (const [name, phone, area] of DEMO_CUSTOMERS) {
    jobs.push(ACT.save('customers', { id: uid('cust'), name, phone, area, address: '', gstin: '', openingBalance: 0, note: 'Demo customer', createdAt: new Date().toISOString() }, S, true));
  }
  await Promise.all(jobs);
}

/* ------------------------------ boot ------------------------------ */
function applyData(d) {
  d = d || {};
  const s = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  if (typeof s.paymentModes === 'string') s.paymentModes = s.paymentModes.split(',').map((x) => x.trim()).filter(Boolean);
  S.settings = s;
  S.products = d.products || [];
  S.customers = d.customers || [];
  S.invoices = d.invoices || [];
  S.payments = d.payments || [];
  S.moves = d.moves || [];
  S.staff = d.staff || [];
  S.ready = true;
  render();
}

let _bootstrapped = false;
function onSnapshotData(d) {
  d = d || {};
  const first = !S.ready;
  applyData(d);
  if (first && DB.mode === 'firebase') {
    const empty = !d.settingsExists && !(d.products || []).length && !(d.customers || []).length && !(d.invoices || []).length;
    if (empty && !_bootstrapped) { _bootstrapped = true; setTimeout(() => onboardingModal(), 400); }
  }
  // Local mode: onboard only when the device has never been set up. `seeded` is written by
  // onboarding itself, so a half-finished or placeholder store cannot skip the setup screen.
  if (first && DB.mode === 'local' && !(d.settings && d.settings.seeded) && !(d.products || []).length) {
    setTimeout(() => onboardingModal(), 400);
  }
}

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem('wb_bill_draft') || 'null');
    if (d && d.lines && d.lines.length) {
      if (confirm(`You have an unfinished bill (${d.lines.length} items, ${d.no || ''}). Restore it?`)) {
        S.bill = { ...blankBill(), ...d };
        S.tab = 'bill';
        render();
      } else localStorage.removeItem('wb_bill_draft');
    }
  } catch (e) { }
}
function saveDraft() {
  try {
    if (S.bill && S.bill.lines && S.bill.lines.length) {
      const { _editing, ...rest } = S.bill;
      localStorage.setItem('wb_bill_draft', JSON.stringify({ ...rest, _editing }));
    } else localStorage.removeItem('wb_bill_draft');
  } catch (e) { }
}

window.addEventListener('beforeunload', saveDraft);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
setInterval(saveDraft, 20000);

window.addEventListener('online', () => UI.toast('Back online — syncing'));
window.addEventListener('offline', () => UI.toast('Offline — changes will sync when internet returns', 'warn', 5000));

/* ---------------------------------------------------------------------------
   Are we on the customer portal?  Reachable at  <site>/#customer
   --------------------------------------------------------------------------- */
function isPortalRoute() {
  const h = String(location.hash || '').toLowerCase();
  return /(^|[#/?&])(customer|portal)($|[=&#/?])/.test(h) || /#customer/.test(h);
}

async function bootPortal() {
  S.portalMode = true;
  document.title = 'Customer portal';
  splash('Opening customer portal…');
  await DB.initPortal();
  try {
    S.portalShopCache = (await DB.readShopInfo()) || null;
  } catch (e) { S.portalShopCache = null; }
  S.settings = { ...DEFAULT_SETTINGS, ...(S.portalShopCache || {}) };
  document.title = (S.settings.shopName || 'Shop') + ' — customer login';
  S.ready = true;
  let user = null;
  try { user = await PORTAL_DB.currentUser(); } catch (e) { user = null; }
  if (user) {
    S.portalUser = user;
    S.portalLoading = true;
    renderPortal();
    PORTAL_DB.load((d) => portalApplyData(d));
  } else {
    renderPortal();
  }
}

window.addEventListener('hashchange', () => location.reload());

(async function boot() {
  if (isPortalRoute()) { await bootPortal(); return; }
  splash('Starting up…');
  const res = await DB.init(onSnapshotData, async (user) => {
    if (!user) {
      S.session = null;
      S.authRequired = true;
      renderLogin();
      return;
    }
    if (S.session && S.session.uid === user.uid) return;    // already resolved
    try {
      UI.toast('Signing in…', 'ok', 1200);
      S.session = await resolveFirebaseSession(user);
      try { sessionStorage.setItem('wb_session', JSON.stringify({ uid: user.uid })); } catch (e) { }
      await afterSession();
    } catch (e) {
      if (e && e.code === 'staff/disabled') S.sessionMessage = 'This staff login has been switched off by the owner.';
      else if (e && e.code === 'staff/not-enabled') S.sessionMessage = 'This login is not enabled in the shop app yet. Ask the owner to add you in Staff.';
      else S.sessionMessage = 'Could not load your access: ' + ((e && (e.message || e.code)) || 'unknown error');
      try { await DB.logout(); } catch (e2) { }
      S.session = null;
      S.authRequired = true;
      renderLogin();
    }
  });
  if (res && res.error) S.bootError = 'Firebase config problem: ' + res.error;
  if (DB.mode === 'local') {
    await DB.loadAll(onSnapshotData);
    if (await LOCAL_AUTH.ownerPasswordSet()) {
      S.authRequired = true;               // owner set a password → everybody signs in (owner or staff)
      S.session = null;
      renderLogin();
    } else {
      S.session = { role: 'owner', isOwner: true, name: S.settings.ownerName || 'Owner', email: S.settings.ownerEmail || '', uid: 'local-owner' };
      S.ready = true;
      render();
      setTimeout(restoreDraft, 300);
      // NOTE: `seeded` is deliberately NOT set here. Onboarding sets it once the owner has
      // actually named the shop — otherwise a visit that never finished setup would look
      // "already set up" next time and the owner would land in an empty shop.
    }
  }
  // offline app shell
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }
  document.title = S.settings.shopName || 'Wholesale Billing';
  if (DB.mode === 'firebase') DB.publishShopInfo(S.settings);
})();
