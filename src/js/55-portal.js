/* =========================================================================
   CUSTOMER PORTAL — what a customer sees after logging in with the
   ID + password the shop created for them.
   Read-only: their own balance, bills, payment history and statements.
   Reached at  <your-site>/#customer
   ========================================================================= */

const PORTAL = {
  mode() { return PORTAL_VIEWS.checking ? 'checking' : (S.portalUser ? 'in' : 'login'); },
  error: '',
  busy: false
};

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */
function renderPortal() {
  const app = document.getElementById('app');
  if (!app) return;
  if (S.portalMode !== true) return;                  // never render the portal into the shop app
  if (!S.ready && !S.portalUser) {                    // still loading
    app.innerHTML = `<div class="splash"><div class="spin"></div><p>Opening customer portal…</p></div>`;
    return;
  }
  document.body.classList.toggle('portal-body', true);
  app.innerHTML = S.portalUser ? portalHomeHTML() : portalLoginHTML();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */
function portalLoginHTML() {
  const shop = S.settings || {};
  const localMode = DB.mode !== 'firebase';
  // (portalEnabled is read from the public shop card, published by the shop app)
  if (S.portalShopCache && S.portalShopCache.portalEnabled === false) {
    return `
    <div class="portal">
      <header class="portal-head">
        <div class="portal-brand">
          <div class="logo">${esc((shop.shopName || 'S').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</div>
          <div><b>${esc(shop.shopName || 'Shop')}</b><small>${esc(shop.phone || '')}</small></div>
        </div>
      </header>
      <main class="portal-main">
        <div class="portal-login-card">
          <h1>Portal closed</h1>
          <p class="muted">The shop has switched off the customer portal for now.</p>
          ${shop.phone ? `<a class="btn primary big" href="tel:${esc(shop.phone)}">Call the shop</a>` : ''}
        </div>
      </main>
    </div>`;
  }
  return `
  <div class="portal">
    <header class="portal-head">
      <div class="portal-brand">
        <div class="logo">${esc((shop.shopName || 'S').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</div>
        <div>
          <b>${esc(shop.shopName || 'Customer Portal')}</b>
          <small>${esc(shop.phone || '')}${shop.address ? ' · ' + esc(shop.address) : ''}</small>
        </div>
      </div>
      <a class="portal-shop-link" href="${location.pathname.replace(/index\.html$/, '')}">Shop owner? Sign in →</a>
    </header>

    <main class="portal-main">
      <div class="portal-login-card">
        <h1>Customer login</h1>
        <p class="muted">See your khata balance, bills and payment history.</p>
        ${PORTAL.error ? `<div class="err">${esc(PORTAL.error)}</div>` : ''}
        <label class="fld"><span>Login ID / mobile</span>
          <input id="pf_id" value="${esc(PORTAL.lastId || '')}" autocomplete="username" placeholder="the ID the shop gave you"></label>
        <label class="fld"><span>Password</span>
          <input id="pf_pw" type="password" autocomplete="current-password" placeholder="••••••••"></label>
        <button class="btn primary big" data-act="portal-login" ${PORTAL.busy ? 'disabled' : ''}>${PORTAL.busy ? 'Signing in…' : 'Sign in'}</button>
        <p class="note-line center">Forgot your password? Call the shop${shop.phone ? ' on ' + esc(shop.phone) : ''} — they can set a new one.</p>
        ${localMode ? `<div class="warn-box">${icon('warn')}<span><b>Local mode:</b> this login is checked on this device only and is not real security. The shop should connect Firebase (Settings → Setup guide) before giving customers logins.</span></div>` : ''}
      </div>
      <p class="portal-foot">Your data stays in the shop's own Firebase project. You can only see your own account.</p>
    </main>
  </div>`;
}

ACTIONS['portal-login'] = async () => {
  const id = document.getElementById('pf_id').value.trim();
  const pw = document.getElementById('pf_pw').value;
  if (!id || !pw) { PORTAL.error = 'Enter your login ID and password.'; renderPortal(); return; }
  PORTAL.lastId = id;                       // keep it typed in if the password is wrong
  PORTAL.busy = true; PORTAL.error = '';
  renderPortal();
  try {
    const user = await PORTAL_DB.signIn(id, pw);
    S.portalUser = user;
    S.portalLoading = true;
    renderPortal();
    portalLoadData(() => renderPortal());
  } catch (e) {
    PORTAL.busy = false;
    PORTAL.error = e.message || 'Could not sign you in.';
    S.portalUser = null;
    renderPortal();
  }
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('pf_pw') === document.activeElement && S.portalMode) ACTIONS['portal-login']();
});

ACTIONS['portal-logout'] = async () => {
  try { await PORTAL_DB.signOut(); } catch (e) { }
  S.portalUser = null;
  S.portalData = null;
  PORTAL.error = '';
  PORTAL.busy = false;
  try { sessionStorage.removeItem('wb_portal'); } catch (e) { }
  // stay on the portal route — never drop a customer into the shop screen
  if (String(location.hash || '').toLowerCase().indexOf('customer') < 0) location.hash = 'customer';
  UI.closeModal();
  renderPortal();
  location.reload();
};

/* ------------------------------------------------------------------ */
/*  Load the customer's own data                                       */
/* ------------------------------------------------------------------ */
function portalApplyData(d) {
  if (d.error === 'not-signed-in') { S.portalUser = null; PORTAL.busy = false; renderPortal(); return; }
  if (d.error === 'no-customer') {
    PORTAL.error = 'This login is not linked to a customer yet. Please ask the shop to create your login again.';
    S.portalUser = null; S.portalLoading = false; renderPortal(); return;
  }
  if (d.error === 'rules') {
    PORTAL.error = 'The shop needs to publish the updated security rules (firestore.rules) before logins work.';
    S.portalUser = null; S.portalLoading = false; renderPortal(); return;
  }
  S.portalData = d;
  S.portalLoading = false;
  // make the portal look like a shop with exactly one customer, so all existing
  // helpers (ledger, allocation, printing) work untouched
  S.settings = { ...DEFAULT_SETTINGS, ...(d.shop || {}), ...(S.portalShopCache || {}) };
  S.customers = [d.customer];
  S.invoices = d.invoices || [];
  S.payments = d.payments || [];
  S.moves = [];
  S.ready = true;
  renderPortal();
}
function portalLoadData(redraw) {
  PORTAL_DB.load((d) => { portalApplyData(d); if (redraw) redraw(); });
}

/* ------------------------------------------------------------------ */
/*  Home — balance, bills, payments, statement                         */
/* ------------------------------------------------------------------ */
function portalHomeHTML() {
  const c = findCustomer(S.customers[0] && S.customers[0].id) || S.customers[0];
  if (!c) return `<div class="portal"><div class="portal-main"><div class="splash"><div class="spin"></div><p>Loading your account…</p></div></div></div>`;
  const shop = S.settings;
  const led = buildLedger(c, S.invoices, S.payments);
  const alloc = allocatePayments(S.invoices, S.payments);
  const openBills = S.invoices.filter((i) => (alloc.byInvoice[i.id] || {}).due > 0.004).sort(sortByDate);
  const bills = S.invoices.slice().sort(sortByDate).reverse();
  const pays = S.payments.slice().sort(sortByDate).reverse();
  const lastPay = pays[0];
  const billed = round2(bills.reduce((s, i) => s + num(i.total), 0));
  const paidTotal = round2(led.credit);
  const bal = led.balance;
  const recent = led.rows.slice(-30).reverse();

  return `
  <div class="portal">
    <header class="portal-head">
      <div class="portal-brand">
        <div class="logo">${esc((shop.shopName || 'S').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</div>
        <div>
          <b>${esc(shop.shopName || 'Shop')}</b>
          <small>${esc(shop.phone || '')}${shop.address ? ' · ' + esc(shop.address) : ''}</small>
        </div>
      </div>
      <div class="portal-user">
        <span>${icon('user')} ${esc(c.name)}</span>
        <button class="btn ghost sm" data-act="portal-logout">Sign out</button>
      </div>
    </header>

    <main class="portal-main">
      <div class="portal-balance ${bal > 0 ? 'due' : 'clear'}">
        <small>${bal > 0 ? 'Your pending balance' : bal < 0 ? 'Advance with the shop' : 'Your account'}</small>
        <b>${money(Math.abs(bal))}</b>
        <span>${bal > 0 ? `${openBills.length} bill${openBills.length === 1 ? '' : 's'} to be settled` : bal < 0 ? 'This amount will be adjusted in your next bill' : 'All settled — thank you! 🙏'}</span>
      </div>

      <div class="portal-kpis">
        <div class="pk"><small>Total billed</small><b>${money(billed)}</b><span>${bills.length} bills</span></div>
        <div class="pk"><small>Total paid</small><b>${money(paidTotal)}</b><span>${pays.length} payments</span></div>
        <div class="pk"><small>Last payment</small><b>${lastPay ? money(lastPay.amount) : '—'}</b><span>${lastPay ? fmtDate(lastPay.date) + ' · ' + esc(lastPay.mode || 'Cash') : 'no payments yet'}</span></div>
        <div class="pk"><small>Oldest pending</small><b>${openBills.length ? money((alloc.byInvoice[openBills[0].id] || {}).due || 0) : '—'}</b><span>${openBills.length ? fmtDate(openBills[0].date) + ` (${daysBetween(openBills[0].date, todayISO())} days)` : 'nothing pending'}</span></div>
      </div>

      <div class="portal-actions">
        <button class="btn ghost" data-act="portal-print-statement">${icon('print')} Statement (print / PDF)</button>
        <button class="btn wa" data-act="portal-wa-statement">${icon('wa')} Send my statement on WhatsApp</button>
        ${shop.phone ? `<button class="btn ghost" data-act="portal-wa-shop">${icon('wa')} Message the shop</button>` : ''}
        ${shop.phone ? `<a class="btn ghost" href="tel:${esc(shop.phone)}">${icon('cash')} Call ${esc(shop.phone)}</a>` : ''}
      </div>

      ${openBills.length ? `<section class="portal-card">
        <h3>Bills to be settled</h3>
        <div class="list">${openBills.map((i) => {
          const a = alloc.byInvoice[i.id];
          return `<button class="row" data-act="portal-view-bill" data-id="${i.id}">
            <div class="row-main"><b>${esc(i.no)}</b><small>${fmtDate(i.date)} · ${(i.lines || []).length} items · ${a.ageDays} days old</small></div>
            <div class="row-right"><b class="warn-t">${money(a.due)}</b><small>of ${money(i.total)}</small></div>
          </button>`;
        }).join('')}</div>
      </section>` : ''}

      <section class="portal-card">
        <h3>All my bills <span class="muted small">(${bills.length})</span></h3>
        ${bills.length ? `<div class="list">${bills.map((i) => {
          const a = alloc.byInvoice[i.id] || { due: 0, status: 'paid' };
          return `<button class="row" data-act="portal-view-bill" data-id="${i.id}">
            <div class="row-main">
              <b>${esc(i.no)} ${statusPill(a.status)}</b>
              <small>${fmtDate(i.date)} · ${(i.lines || []).map((l) => esc(l.name)).join(', ').slice(0, 60)}</small>
            </div>
            <div class="row-right">
              <b>${money(i.total)}</b>
              <small>${a.due > 0 ? `<span class="warn-t">${money(a.due)} pending</span>` : '<span class="ok-t">settled</span>'}</small>
            </div>
          </button>`;
        }).join('')}</div>` : '<div class="pad muted">No bills yet.</div>'}
      </section>

      <section class="portal-card">
        <h3>Payments I have made <span class="muted small">(${pays.length})</span></h3>
        ${pays.length ? `<div class="list">${pays.map((p) => `<div class="row plain">
            <div class="row-main"><b>${money(p.amount)}</b><small>${fmtDate(p.date)} · ${esc(p.mode || 'Cash')}${p.note ? ' · ' + esc(p.note) : ''}</small></div>
            <div class="row-right"><small>${creditNote(p)}</small></div>
          </div>`).join('')}</div>` : '<div class="pad muted">No payments recorded yet.</div>'}
      </section>

      <section class="portal-card">
        <h3>My khata history <span class="muted small">(latest 30 of ${led.rows.length})</span></h3>
        <div class="table-wrap"><table class="mini-table">
          <thead><tr><th>Date</th><th>Details</th><th class="r">Bill ${CUR}</th><th class="r">Paid ${CUR}</th><th class="r">Balance</th></tr></thead>
          <tbody>${recent.map((r) => `<tr class="lr ${r.type}">
            <td>${fmtDateShort(r.date)}</td>
            <td>${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td>
            <td class="r">${r.debit ? money(r.debit, false) : ''}</td>
            <td class="r ok-t">${r.credit ? money(r.credit, false) : ''}</td>
            <td class="r b">${money(r.balance, false)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>

      <p class="portal-foot">
        Something not matching your own records? ${shop.phone ? `Call the shop on ${esc(shop.phone)}.` : 'Contact the shop.'}
        This page is read-only — only the shop can change bills and payments.
        ${DB.mode !== 'firebase' ? '<br><b>Local mode:</b> this login is not real security (asks the shop to connect Firebase).' : ''}
      </p>
    </main>
  </div>`;
}

function creditNote(p) {
  const inv = S.invoices.find((i) => i.id === p.invoiceId);
  return inv ? 'for bill ' + esc(inv.no) : 'adjusted against oldest bill';
}

/* ------------------------------------------------------------------ */
/*  One bill in detail                                                 */
/* ------------------------------------------------------------------ */
ACTIONS['portal-view-bill'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  const alloc = allocatePayments(S.invoices, S.payments).byInvoice[inv.id] || { due: 0, paid: 0, status: 'paid', paidAtSale: 0, paidTotal: 0 };
  const shop = S.settings;
  UI.openModal('Bill ' + inv.no, `
    <div class="inv-view">
      <div class="inv-head">
        <div><small>Date</small><b>${fmtDate(inv.date)}</b></div>
        <div><small>Bill total</small><b>${money(inv.total)}</b></div>
        <div><small>Paid</small><b>${money(alloc.paidTotal)}</b></div>
        <div><small>Pending</small><b class="${alloc.due > 0 ? 'warn-t' : 'ok-t'}">${money(alloc.due)}</b></div>
      </div>
      <table class="mini-table">
        <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>${shop.taxEnabled ? '<th class="r">GST</th>' : ''}<th class="r">Amount</th></tr></thead>
        <tbody>${(inv.lines || []).map((l) => `<tr>
          <td>${esc(l.name)}${l.sellUnit === 'box' && num(l.ppb) > 1 ? `<small>${qtyFmt(l.qty)} box × ${qtyFmt(l.ppb)} ${esc(l.unit)}</small>` : ''}</td>
          <td class="r">${qtyFmt(l.qty)} ${esc(l.sellUnit === 'box' ? 'box' : l.unit)}</td>
          <td class="r">${money(l.rate)}</td>
          ${shop.taxEnabled ? `<td class="r">${pct(l.gstPct)}%</td>` : ''}
          <td class="r">${money(l.total)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="inv-tots">
        <div><span>Items total</span><b>${money(num(inv.totals ? inv.totals.gross : inv.total))}</b></div>
        ${num(inv.totals && inv.totals.billDiscount) + num(inv.totals && inv.totals.itemDiscount) ? `<div><span>Discount</span><b>-${money(num(inv.totals.billDiscount) + num(inv.totals.itemDiscount))}</b></div>` : ''}
        ${shop.taxEnabled ? `<div><span>GST</span><b>${money(num(inv.totals ? inv.totals.tax : inv.tax))}</b></div>` : ''}
        <div class="grand"><span>Grand total</span><b>${money(inv.total)}</b></div>
        ${num(alloc.paidAtSale) ? `<div class="ok-t"><span>Paid when billed</span><b>${money(alloc.paidAtSale)}</b></div>` : ''}
        ${num(alloc.paid) ? `<div class="ok-t"><span>Paid later</span><b>${money(alloc.paid)}</b></div>` : ''}
        <div class="${alloc.due > 0 ? 'warn-t' : 'ok-t'}"><span>Still pending on this bill</span><b>${money(alloc.due)}</b></div>
      </div>
      ${inv.note ? `<p class="note-line">Note: ${esc(inv.note)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn primary" data-act="portal-print-bill" data-id="${inv.id}">${icon('print')} Print / save as PDF</button>
        ${shop.phone ? `<button class="btn ghost" data-act="portal-ask-bill" data-id="${inv.id}">${icon('wa')} Ask the shop about this bill</button>` : ''}
        <button class="btn ghost" data-act="modal-close">Close</button>
      </div>
    </div>`, { wide: true });
};

ACTIONS['portal-print-bill'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  printHTML(invoiceHTML(inv, 'invoice'), 'Invoice ' + inv.no);
};

ACTIONS['portal-print-statement'] = () => {
  const c = S.customers[0];
  const led = buildLedger(c, S.invoices, S.payments);
  const s = S.settings;
  printHTML(`<div class="print-sheet">
    <div class="p-head"><div class="p-shop"><h2>${esc(s.shopName)}</h2>
      <div class="sm">${esc(s.address || '')}${s.phone ? '<br>Ph: ' + esc(s.phone) : ''}</div></div>
      <div class="p-meta"><div class="p-title">KHATA STATEMENT</div><div><b>Date:</b> ${fmtDate(todayISO())}</div></div></div>
    <div class="p-billto"><div class="sm">ACCOUNT OF</div><b>${esc(c.name)}</b>${c.phone ? `<div class="sm">Ph: ${esc(c.phone)}</div>` : ''}</div>
    <table class="p-table"><thead><tr><th>Date</th><th>Particulars</th><th class="r">Bill ${CUR}</th><th class="r">Paid ${CUR}</th><th class="r">Balance ${CUR}</th></tr></thead>
      <tbody>${led.rows.map((r) => `<tr><td>${fmtDateShort(r.date)}</td><td>${esc(r.label)}${r.sub ? ' — ' + esc(r.sub) : ''}</td>
        <td class="r">${r.debit ? money(r.debit, false) : ''}</td><td class="r">${r.credit ? money(r.credit, false) : ''}</td>
        <td class="r b">${money(r.balance, false)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2" class="b">TOTAL</td><td class="r b">${money(led.debit, false)}</td><td class="r b">${money(led.credit, false)}</td>
        <td class="r b">${money(led.balance, false)}</td></tr></tfoot></table>
    <div class="p-words"><b>Closing balance:</b> ${money(led.balance)} ${led.balance > 0 ? '(to be paid to the shop)' : led.balance < 0 ? '(advance with the shop)' : ''}</div>
    <div class="p-sign"><div class="sign-line"></div><div class="sm">${esc(s.shopName)}</div></div>
  </div>`, 'Khata statement');
};

/* ------------------------------------------------------------------ */
/*  WhatsApp from the customer side                                    */
/* ------------------------------------------------------------------ */
ACTIONS['portal-wa-statement'] = () => {
  const c = S.customers[0];
  if (!c) return;
  if (!c.phone) { UI.toast('Ask the shop to save your WhatsApp number', 'warn', 5000); return; }
  waOpen(c.phone, statementWAText(c));
  UI.toast('Opening WhatsApp with your statement');
};

ACTIONS['portal-wa-shop'] = () => {
  const s = S.settings;
  const c = S.customers[0];
  if (!s.phone) return;
  const bal = c ? customerBalance(c, S.invoices, S.payments) : 0;
  const text = `${s.shopName ? '' : ''}${c ? c.name : 'Customer'}
My khata balance shows *${money(bal)}*.
Please check and confirm. Thank you.`;
  waOpen(s.phone, text);
};

ACTIONS['portal-ask-bill'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  const s = S.settings;
  const c = S.customers[0];
  if (!inv || !s.phone) return;
  const alloc = allocatePayments(S.invoices, S.payments).byInvoice[inv.id] || { due: 0 };
  waOpen(s.phone, `${c ? c.name : ''} here.
About bill *${inv.no}* dated ${fmtDate(inv.date)} — total ${money(inv.total)}, pending ${money(alloc.due)}.
Please check this for me. Thank you.`);
};

/* ------------------------------------------------------------------ */
/*  Owner side: create / manage a customer's login                     */
/* ------------------------------------------------------------------ */
function portalCustomerBadge(c) {
  if (!c || !c.portal) return '<span class="pill">no login</span>';
  return `<span class="pill ok">login: ${esc(c.portal.username)}</span>`;
}
/** The section shown inside the add/edit-customer dialog */
function portalCredsSection(c) {
  const p = c && c.portal;
  if (p) {
    return `<div class="portal-box">
      <div class="pb-head">${icon('user')} <b>Customer login</b> <span class="pill ok">active</span></div>
      <div class="pb-grid">
        <div><small>Login ID</small><b>${esc(p.username)}</b></div>
        <div><small>Created</small><b>${p.createdAt ? fmtDate(p.createdAt.slice(0, 10)) : '—'}</b></div>
        <div><small>Portal</small><b><a href="${esc(portalLink())}" target="_blank" rel="noopener">${esc(portalLink())}</a></b></div>
      </div>
      <div class="modal-actions left">
        <button class="btn ghost sm" data-act="portal-send" data-id="${c.id}">${icon('wa')} Send login details</button>
        <button class="btn ghost sm" data-act="portal-change-pass" data-id="${c.id}">Change password</button>
        <button class="btn danger sm" data-act="portal-remove" data-id="${c.id}">Remove login</button>
      </div>
      <p class="note-line">Passwords are never stored in this app — click <b>Send login details</b> right after setting a password, or type it again to send later.</p>
    </div>`;
  }
  return `<div class="portal-box">
    <div class="pb-head">${icon('user')} <b>Customer login</b> <span class="muted small">customer can see their balance &amp; payments</span></div>
    <div class="form-grid">
      <label class="fld"><span>Login ID</span>
        <input id="po_user" value="${esc((c && (c.code || c.name || '')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || '')}" placeholder="e.g. ramesh123"></label>
      <label class="fld"><span>Password (min 6)</span>
        <input id="po_pass" value="${esc(randomPassword(8))}" autocomplete="off"></label>
    </div>
    <div class="modal-actions left">
      <button class="btn sm" data-act="portal-generate">New password</button>
      <button class="btn primary sm" data-act="portal-create" data-id="${c ? c.id : ''}">${icon('check')} Create login</button>
    </div>
    <p class="note-line">Customers log in at <b>${esc(portalLink())}</b> with this ID + password and see only their own khata.
      ${DB.mode !== 'firebase' ? '<b class="warn-t">Local mode is not real security</b> — connect Firebase first (Settings → Setup guide).' : 'Firebase Auth creates a real, secure account.'}</p>
  </div>`;
}

ACTIONS['portal-generate'] = () => {
  const el = document.getElementById('po_pass');
  if (el) { el.value = randomPassword(8); el.focus(); el.select(); }
};

ACTIONS['portal-create'] = async (el) => {
  if (!requirePerm('portal', 'manage customer logins')) return;
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  const id = document.getElementById('po_user').value.trim();
  const pw = document.getElementById('po_pass').value;
  if (!portalIdOk(id)) return UI.toast('Login ID: 3–30 letters/numbers (or a real email)', 'warn', 5000);
  if (String(pw).length < 6) return UI.toast('Password must be at least 6 characters', 'warn', 5000);
  const taken = S.customers.find((x) => x.portal && String(x.portal.username || '').toLowerCase() === id.toLowerCase() && x.id !== c.id);
  if (taken) return UI.toast('That login ID is already used by ' + taken.name, 'warn', 5000);
  try {
    UI.toast('Creating login…', 'ok', 1500);
    const created = await PORTAL_DB.createLogin(id, pw);
    c.portal = {
      username: id, email: created.email, authUid: created.uid || '', active: true,
      mode: created.local ? 'local' : 'firebase',
      salt: created.local ? newSalt() : '', createdAt: new Date().toISOString()
    };
    if (created.local) c.portal.passHash = await hashPassword(pw, c.portal.salt);
    await ACT.save('customers', c, S, true);
    S._portalPw = pw;
    UI.toast('Login created for ' + c.name + ' ✓');
    customerModal(c.id, () => { render(); });
  } catch (e) {
    UI.toast(e.message || 'Could not create the login', 'warn', 7000);
  }
};

ACTIONS['portal-change-pass'] = (el) => {
  if (!requirePerm('portal', 'manage customer logins')) return;
  const c = findCustomer(el.dataset.id);
  if (!c || !c.portal) return;
  UI.openModal('Change password — ' + c.name, `
    <div class="form-grid">
      <label class="fld"><span>Current password</span><input id="pc_old" autocomplete="off"></label>
      <label class="fld"><span>New password (min 6)</span><input id="pc_new" value="${esc(randomPassword(8))}" autocomplete="off"></label>
    </div>
    <p class="note-line">In local mode the current password is not needed.</p>
    <div class="modal-actions">
      <button class="btn primary" data-act="portal-change-save" data-id="${c.id}">${icon('check')} Save new password</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
};
ACTIONS['portal-change-save'] = async (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c || !c.portal) return;
  const oldPw = document.getElementById('pc_old').value;
  const newPw = document.getElementById('pc_new').value;
  if (String(newPw).length < 6) return UI.toast('New password must be at least 6 characters', 'warn');
  try {
    if (DB.mode === 'firebase') await PORTAL_DB.changePassword(c.portal.username, oldPw, newPw);
    if (DB.mode !== 'firebase' || c.portal.mode === 'local') {
      c.portal.salt = newSalt();
      c.portal.passHash = await hashPassword(newPw, c.portal.salt);
      c.portal.mode = 'local';
      await ACT.save('customers', c, S, true);
    }
    S._portalPw = newPw;
    UI.toast('Password changed ✓');
    customerModal(c.id, () => render());
  } catch (e) {
    UI.toast(e.message || 'Could not change the password', 'warn', 7000);
  }
};

ACTIONS['portal-remove'] = (el) => {
  if (!requirePerm('portal', 'manage customer logins')) return;
  const c = findCustomer(el.dataset.id);
  if (!c || !c.portal) return;
  UI.openModal('Remove login — ' + c.name, `
    <p class="pad-top">The customer will no longer be able to sign in. Their bills and payments stay untouched.</p>
    ${DB.mode === 'firebase' ? `<div class="form-grid"><label class="fld wide"><span>Password (to delete the Firebase account)</span><input id="pr_pw" autocomplete="off"></label></div>
      <p class="note-line">The owner set this password when creating the login. Type it to remove the account completely.</p>` : ''}
    <div class="modal-actions">
      <button class="btn danger" data-act="portal-remove-confirm" data-id="${c.id}">${icon('trash')} Remove login</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
};
ACTIONS['portal-remove-confirm'] = async (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c || !c.portal) return;
  const pw = document.getElementById('pr_pw') ? document.getElementById('pr_pw').value : '';
  let warning = '';
  if (DB.mode === 'firebase') {
    const res = await PORTAL_DB.deleteLogin(c.portal.username, pw);
    warning = res && res.warning ? res.warning : '';
  }
  delete c.portal;
  await ACT.save('customers', c, S, true);
  UI.closeModal();
  UI.toast(warning ? warning : 'Login removed for ' + c.name, warning ? 'warn' : 'ok', warning ? 9000 : 3000);
  render();
};

/** WhatsApp the customer their login details */
ACTIONS['portal-send'] = (el) => {
  if (!requirePerm('portal', 'manage customer logins')) return;
  const c = findCustomer(el.dataset.id);
  if (!c || !c.portal) return;
  const pw = S._portalPw || '';
  UI.openModal('Send login details — ' + c.name, `
    <p class="pad-top">This is what the customer receives.${pw ? '' : ' You did not set a password in this session — type it below to include it, or share it separately.'}</p>
    <div class="form-grid">
      <label class="fld wide"><span>Password to include</span><input id="ps_pw" value="${esc(pw)}" autocomplete="off" placeholder="leave blank to send without password"></label>
      <label class="fld wide"><span>Message</span><textarea id="ps_text" rows="7">${esc(portalShareText(c, pw))}</textarea></label>
    </div>
    <div class="modal-actions">
      ${c.phone ? `<button class="btn wa" data-act="portal-send-wa" data-id="${c.id}">${icon('wa')} Send on WhatsApp</button>` : ''}
      <button class="btn ghost" data-act="portal-send-copy">Copy message</button>
      <button class="btn ghost" data-act="modal-close">Close</button>
    </div>
    ${c.phone ? '' : '<p class="note-line">This customer has no WhatsApp number saved — add one in their details to send directly, or use Copy.</p>'}`);
};
function portalShareText(c, pw) {
  const s = S.settings;
  return `${c.name} ji 🙏
*${s.shopName || 'Shop'}* — apna khata online dekhne ke liye:

🔗 ${portalLink()}
👤 Login ID: ${c.portal.username}
🔑 Password: ${pw || '(the password I told you)'}

Yahan aap apna *balance, saare bill aur payment history* dekh sakte ho (aur statement print/PDF kar sakte ho). Koi dikkat ho to mujhe batao.
${s.phone ? 'Ph: ' + s.phone : ''}`;
}
ACTIONS['portal-send-wa'] = (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  const pw = document.getElementById('ps_pw') ? document.getElementById('ps_pw').value : '';
  const text = document.getElementById('ps_text') ? document.getElementById('ps_text').value : portalShareText(c, pw);
  if (!c.phone) return UI.toast('No WhatsApp number saved for this customer', 'warn');
  waOpen(c.phone, text);
  UI.toast('Opening WhatsApp with the login details');
};
ACTIONS['portal-send-copy'] = async () => {
  const text = document.getElementById('ps_text').value;
  const ok = await copyText(text);
  UI.toast(ok ? 'Message copied — paste it in WhatsApp or SMS' : 'Could not copy', ok ? 'ok' : 'warn');
};
