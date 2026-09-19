/* =========================================================================
   APP SHELL — header, navigation, router, shared UI pieces
   ========================================================================= */

const NAV = [
  { id: 'dash', label: 'Home', ic: 'dash' },
  { id: 'bill', label: 'New Bill', ic: 'bill' },
  { id: 'khata', label: 'Khata', ic: 'khata' },
  { id: 'payments', label: 'Payment', ic: 'cash' },
  { id: 'products', label: 'Stock', ic: 'box' },
  { id: 'reports', label: 'Reports', ic: 'chart' },
  { id: 'invoices', label: 'Bills', ic: 'invoice' },
  { id: 'settings', label: 'Settings', ic: 'gear' },
  { id: 'staff', label: 'Staff', ic: 'user' }   // only the owner passes canOpenView('staff')
];

function taxOpts() {
  return {
    taxEnabled: !!S.settings.taxEnabled,
    priceIncludesTax: !!S.settings.priceIncludesTax,
    roundOff: !!S.settings.roundOff
  };
}
function findCustomer(id) { return S.customers.find((c) => c.id === id) || null; }
function findProduct(id) { return S.products.find((p) => p.id === id) || null; }
function findInvoice(id) { return S.invoices.find((i) => i.id === id) || null; }
function optsCustomers() {
  return S.customers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function nextBillNo() {
  let max = 0;
  S.invoices.forEach((i) => {
    const m = String(i.no || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  const n = Math.max(num(S.settings.nextInvoiceNo) || 1, max + 1);
  return String(S.settings.invoicePrefix || 'INV-') + String(n).padStart(4, '0');
}
function shellTotal() {
  return round2(S.invoices.reduce((s, i) => s + num(i.total), 0));
}
function receivableTotal() {
  return round2(S.customers.reduce((s, c) => s + Math.max(0, customerBalance(c, S.invoices, S.payments)), 0));
}
function advanceTotal() {
  return round2(S.customers.reduce((c, x) => s + Math.min(0, customerBalance(c, S.invoices, S.payments)), 0));
}

function clearShell() {
  ['hdr', 'nav', 'view'].forEach((id) => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
}
function splash(msg) {
  clearShell();
  document.getElementById('app').innerHTML = `<div class="splash"><div class="spin"></div><p>${esc(msg || 'Loading your shop data…')}</p></div>`;
}
function render() {
  if (S.portalMode) return renderPortal();          // portal owns the screen
  if (S.authRequired && !DB.user) return renderLogin();
  if (!S.ready) return splash();
  document.getElementById('app').innerHTML = '';
  renderHeader();
  renderNav();
  renderView();
  UI.syncBadge();
  UI.renderToasts();
  if (UI.modal) UI.renderModal();
}

function renderHeader() {
  const el = document.getElementById('hdr');
  const s = S.settings;
  const localWarn = DB.mode !== 'firebase';
  el.innerHTML = `
    <div class="hdr-in">
      <div class="hdr-left">
        <div class="logo">${esc((s.shopName || 'S').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</div>
        <div>
          <div class="shop-name">${esc(s.shopName || 'My Wholesale Store')}</div>
          <div class="shop-sub">${esc(s.phone || '')}${s.gstin ? ' · GSTIN ' + esc(s.gstin) : ''}</div>
        </div>
      </div>
      <div class="hdr-right">
        <span class="today">${fmtDate(todayISO())}</span>
        ${S.session ? `<span class="who" title="${esc(S.session.email || '')}">${icon('user')}${esc(sessionLabel())}${S.session.isOwner ? '' : ' · ' + esc(roleById(S.session.role).label)}</span>` : ''}
        <span id="sync-badge" class="badge"></span>
        <button class="icon-btn hdr-btn" data-act="log-out" title="Sign out">${icon('back')}</button>
      </div>
    </div>
    ${localWarn ? `<div class="banner" data-act="go-settings">${icon('warn')}
        <span><b>Local mode</b> — data is saved only in this browser. Connect Firebase for multi-device sync & backup. <u>Open setup</u></span></div>` : ''}`;
}

function renderNav() {
  const el = document.getElementById('nav');
  // A tab the login may not open stays put and renderView shows the "No access" card,
  // so a blocked screen always explains itself instead of silently jumping to Home.
  const allowed = NAV.filter((n) => canOpenView(n.id));
  el.innerHTML = allowed.map((n) => `<button class="nav-item ${S.tab === n.id ? 'active' : ''}" data-act="tab" data-tab="${n.id}">
      ${icon(n.ic)}<span>${n.label}</span></button>`).join('');
}

function renderView() {
  if (!canOpenView(S.tab)) {
    document.getElementById('view').innerHTML = `<div class="view">${card('', `
      <div class="empty">${icon('lock')}
        <p><b>No access</b><br>Your login (${esc(sessionLabel())}) does not have permission for this screen.<br>
        Ask the shop owner if you need it.</p>
        <button class="btn" data-act="tab" data-tab="dash">Back to Home</button></div>`)}</div>`;
    return;
  }
  const v = VIEWS[S.tab] || VIEWS.dash;
  const host = document.getElementById('view');
  host.innerHTML = v();
  host.scrollTop = 0;
  if (S.tab !== 'bill') window.scrollTo({ top: 0 });
  if (VIEWS[`_after_${S.tab}`]) VIEWS[`_after_${S.tab}`]();
}

ACTIONS.tab = (el) => { S.tab = el.dataset.tab; S.filters.prod.q = ''; render(); };
ACTIONS['go-settings'] = () => { S.tab = 'settings'; render(); };
ACTIONS['modal-close'] = () => UI.closeModal();

/* ---------------- shared components ---------------- */
function kpi(label, value, sub, tone, act, actData) {
  return `<div class="kpi ${tone || ''}" ${act ? `data-act="${act}" ${actData || ''} role="button" tabindex="0"` : ''}>
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}
function card(title, body, extra) {
  return `<section class="card">
    ${title ? `<div class="card-head"><h3>${title}</h3>${extra || ''}</div>` : extra ? `<div class="card-head">${extra}</div>` : ''}
    ${body}</section>`;
}
function emptyState(msg, actionLabel, action, icName) {
  return `<div class="empty">${icon(icName || 'box')}<p>${esc(msg)}</p>
    ${actionLabel ? `<button class="btn" data-act="${action}">${actionLabel}</button>` : ''}</div>`;
}
function statusPill(status) {
  const map = { paid: ['Paid', 'ok'], partial: ['Partial', 'warn'], unpaid: ['Unpaid', 'bad'], credit: ['Credit', 'warn'] };
  const m = map[status] || [status, ''];
  return `<span class="pill ${m[1]}">${m[0]}</span>`;
}
function customerOptions(selected) {
  return `<option value="">— Cash / Walk-in customer —</option>` + optsCustomers().map((c) =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`
  ).join('');
}
function productOptions(selected) {
  return `<option value="">— choose item —</option>` + S.products.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) =>
    `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}${p.code ? ' [' + esc(p.code) + ']' : ''} — ${packDisplay(p.stock, p.ppb, p.unit)}</option>`
  ).join('');
}
/** grouped list of moves for one product */
function productHistory(productId) {
  return (S.moves || []).filter((m) => m.productId === productId).sort((a, b) => (a.date < b.date ? 1 : -1));
}
function typeLabel(t) {
  return ({ sale: 'Sold', purchase: 'Stock in', reverse: 'Bill cancelled', adjust: 'Adjust', return: 'Return' })[t] || t;
}
