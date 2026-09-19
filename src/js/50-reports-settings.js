/* =========================================================================
   VIEWS — Reports + Settings (+ backup, demo data, Firebase setup guide)
   ========================================================================= */

VIEWS.reports = function () {
  const r = S.range;
  const rep = reportRange(S, r.from, r.to);
  const aging = agingBuckets(S.invoices, S.payments);
  const dues = dueCustomers(S.customers, S.invoices, S.payments);
  const collection = round2(rep.collected + rep.invoices.reduce((s, i) => s + num(i.paidAtSale), 0));
  const days = Math.max(1, daysBetween(r.from, r.to) + 1);
  const presets = [
    ['Today', todayISO(), todayISO()],
    ['Yesterday', addDaysISO(todayISO(), -1), addDaysISO(todayISO(), -1)],
    ['This week', addDaysISO(todayISO(), -6), todayISO()],
    ['This month', todayISO().slice(0, 8) + '01', todayISO()],
    ['Last 30 days', addDaysISO(todayISO(), -29), todayISO()],
    ['This year', todayISO().slice(0, 4) + '-01-01', todayISO()]
  ];

  return `<div class="view">
    ${card('', `
      <div class="filters">
        ${presets.map(([label, f, t]) => `<button class="chip ${r.from === f && r.to === t ? 'active' : ''}" data-act="range-preset" data-from="${f}" data-to="${t}">${label}</button>`).join('')}
        <label class="fld sm"><span>From</span><input type="date" value="${r.from}" data-input="range" data-f="from"></label>
        <label class="fld sm"><span>To</span><input type="date" value="${r.to}" data-input="range" data-f="to"></label>
        <span class="spacer"></span>
        <button class="btn ghost sm" data-act="export-report">${icon('download')} Export CSV</button>
        <button class="btn ghost sm" data-act="print-report">${icon('print')} Print</button>
      </div>
      <div class="stat-line"><span>Showing <b>${fmtDate(r.from)}</b> to <b>${fmtDate(r.to)}</b> (${days} days)</span></div>
    `)}

    <div class="grid kpis">
      ${kpi('Sales', money(rep.sales), `${rep.billCount} bills · avg ${money(rep.billCount ? round2(rep.sales / rep.billCount) : 0)}`, 'accent')}
      ${can('cost') ? kpi('Gross profit', money(rep.profit), 'sales − tax − cost', rep.profit >= 0 ? 'ok' : 'bad') : ''}
      ${kpi('Collected', money(collection), `${money(rep.collected)} from old khata`, 'ok')}
      ${kpi('New udhaar', money(rep.creditGiven), 'credit given in period', rep.creditGiven > 0 ? 'warn' : '')}
      ${kpi('GST payable', money(rep.tax), 'output tax on sales')}
      ${kpi('Purchases', money(rep.purchases), 'stock in value')}
    </div>

    <div class="two-col">
      ${card('Collection by mode', `<div class="mini-stats">
          ${Object.keys(rep.byMode).map((m) => `<div><small>${esc(m)}</small><b>${money(rep.byMode[m])}</b></div>`).join('') || '<div class="muted">No khata payments in this period</div>'}
          <div><small>Cash at billing</small><b>${money(round2(rep.invoices.reduce((s, i) => s + num(i.paidAtSale), 0)))}</b></div>
        </div>`)}

      ${card('How much is stuck where', `<div class="mini-stats four">
          <div><small>0–15 days</small><b>${money(aging['0-15'])}</b></div>
          <div><small>16–30 days</small><b class="warn-t">${money(aging['16-30'])}</b></div>
          <div><small>31–60 days</small><b class="bad-t">${money(aging['31-60'])}</b></div>
          <div><small>60+ days</small><b class="bad-t">${money(aging['60+'])}</b></div>
        </div>`)}
    </div>

    <div class="two-col">
      ${card('Best selling items', rep.topProducts.length ? `<div class="table-wrap"><table class="mini-table">
        <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Sales</th>${can('cost') ? '<th class="r">Profit</th>' : ''}</tr></thead>
        <tbody>${rep.topProducts.slice(0, 12).map((p) => `<tr><td>${esc(p.name)}</td>
          <td class="r">${qtyFmt(p.qty)} ${esc(p.unit)}</td><td class="r b">${money(p.amount)}</td>
          ${can('cost') ? `<td class="r ${p.profit >= 0 ? 'ok-t' : 'bad-t'}">${money(p.profit)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<div class="pad muted">No items sold in this period.</div>')}

      ${card('Day-wise sales & collection', (() => {
        const byDay = {};
        rep.invoices.forEach((i) => {
          byDay[i.date] = byDay[i.date] || { sales: 0, collect: 0, bills: 0 };
          byDay[i.date].sales = round2(byDay[i.date].sales + num(i.total));
          byDay[i.date].collect = round2(byDay[i.date].collect + num(i.paidAtSale));
          byDay[i.date].bills++;
        });
        S.payments.filter((p) => inRange(p.date, r.from, r.to)).forEach((p) => {
          byDay[p.date] = byDay[p.date] || { sales: 0, collect: 0, bills: 0 };
          byDay[p.date].collect = round2(byDay[p.date].collect + num(p.amount));
        });
        const keys = Object.keys(byDay).sort().reverse().slice(0, 10);
        if (!keys.length) return '<div class="pad muted">No activity in this period.</div>';
        const max = Math.max(...keys.map((k) => byDay[k].sales)) || 1;
        return `<div class="bars">${keys.map((k) => `<div class="bar-row">
            <span class="bar-day">${fmtDateShort(k)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (byDay[k].sales / max) * 100)}%"></div></div>
            <span class="bar-val">${money(byDay[k].sales, false)}</span>
            <span class="bar-sub">collected ${money(byDay[k].collect, false)}</span>
          </div>`).join('')}</div>`;
      })())}
    </div>

    ${card('Biggest pending balances', dues.length ? `<div class="table-wrap"><table class="mini-table">
        <thead><tr><th>Customer</th><th>Phone</th><th class="r">Balance</th><th class="r">Oldest due</th><th></th></tr></thead>
        <tbody>${dues.slice(0, 15).map(({ customer, balance }) => {
          const invs = S.invoices.filter((i) => i.customerId === customer.id);
          const alloc = allocatePayments(invs, S.payments);
          const open = invs.filter((i) => (alloc.byInvoice[i.id] || {}).due > 0.004).sort(sortByDate);
          const age = open.length ? daysBetween(open[0].date, todayISO()) : 0;
          return `<tr><td><b>${esc(customer.name)}</b></td><td>${esc(customer.phone || '—')}</td>
            <td class="r b">${money(balance)}</td><td class="r ${age > 30 ? 'bad-t' : age > 15 ? 'warn-t' : ''}">${age} days</td>
            <td class="r"><button class="btn ghost sm" data-act="wa-reminder" data-id="${customer.id}">${icon('wa')} Remind</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="pad muted">Nobody owes you anything. 🎉</div>')}
  </div>`;
};

ACTIONS['range-preset'] = (el) => { S.range = { from: el.dataset.from, to: el.dataset.to }; render(); };
ACTIONS['range'] = (el) => { S.range[el.dataset.f] = el.value; render(); if (el.dataset.f === 'from' || el.dataset.f === 'to') { /* keep focus */ } };

ACTIONS['export-report'] = () => {
  const r = S.range;
  const rep = reportRange(S, r.from, r.to);
  const rows = rep.invoices.map((i) => ({
    no: i.no, date: i.date, customer: i.customerName, items: (i.lines || []).length,
    qty: i.totals ? i.totals.qty : '', taxable: i.totals ? i.totals.subtotal : '', tax: i.tax, total: i.total,
    paid: i.paidAtSale, pending: round2(num(i.total) - num(i.paidAtSale))
  }));
  download(`report_${r.from}_to_${r.to}.csv`, csv(rows, [
    { label: 'Bill', value: 'no' }, { label: 'Date', value: 'date' }, { label: 'Customer', value: 'customer' },
    { label: 'Items', value: 'items' }, { label: 'Qty', value: 'qty' }, { label: 'Taxable', value: 'taxable' },
    { label: 'GST', value: 'tax' }, { label: 'Total', value: 'total' }, { label: 'Paid', value: 'paid' },
    { label: 'Pending', value: 'pending' }
  ]), 'text/csv');
  UI.toast('Report CSV downloaded');
};

ACTIONS['print-report'] = () => {
  const r = S.range;
  const rep = reportRange(S, r.from, r.to);
  const collection = round2(rep.collected + rep.invoices.reduce((s, i) => s + num(i.paidAtSale), 0));
  printHTML(`<div class="print-sheet">
    <div class="p-head"><div class="p-shop"><h2>${esc(S.settings.shopName)}</h2><div class="sm">Sales report</div></div>
      <div class="p-meta"><div class="p-title">REPORT</div><div>${fmtDate(r.from)} — ${fmtDate(r.to)}</div></div></div>
    <table class="p-table"><tbody>
      <tr><td>Bills</td><td class="r b">${rep.billCount}</td></tr>
      <tr><td>Sales</td><td class="r b">${money(rep.sales)}</td></tr>
      <tr><td>GST collected</td><td class="r">${money(rep.tax)}</td></tr>
      <tr><td>Gross profit</td><td class="r b">${money(rep.profit)}</td></tr>
      <tr><td>Total collected (billing + khata)</td><td class="r b">${money(collection)}</td></tr>
      <tr><td>New udhaar given</td><td class="r">${money(rep.creditGiven)}</td></tr>
      <tr><td>Total receivable today</td><td class="r b">${money(receivableTotal())}</td></tr>
      ${can('cost') ? `<tr><td>Stock value (at cost)</td><td class="r">${money(stockValue(S.products))}</td></tr>` : ''}
    </tbody></table>
    <h4>Top items</h4>
    <table class="p-table"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead>
      <tbody>${rep.topProducts.slice(0, 15).map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${qtyFmt(p.qty)}</td><td class="r">${money(p.amount)}</td></tr>`).join('') || '<tr><td class="sm">None</td></tr>'}</tbody></table>
    <h4>Bills</h4>
    <table class="p-table"><thead><tr><th>Date</th><th>Bill</th><th>Customer</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Pending</th></tr></thead>
      <tbody>${rep.invoices.map((i) => `<tr><td>${fmtDateShort(i.date)}</td><td>${esc(i.no)}</td><td>${esc(i.customerName)}</td>
        <td class="r">${money(i.total, false)}</td><td class="r">${money(i.paidAtSale, false)}</td>
        <td class="r">${money(num(i.total) - num(i.paidAtSale), false)}</td></tr>`).join('')}</tbody></table>
    <div class="p-sign"><div class="sign-line"></div><div class="sm">For ${esc(S.settings.shopName)}</div></div>
  </div>`, 'Report');
};

/* ============================== SETTINGS ============================== */
VIEWS.settings = function () {
  const s = S.settings;
  const counts = {
    products: S.products.length, customers: S.customers.length, invoices: S.invoices.length,
    payments: S.payments.length, moves: S.moves.length
  };
  return `<div class="view">
    ${card('Shop details', `
      <div class="form-grid">
        <label class="fld wide"><span>Shop name</span><input value="${esc(s.shopName)}" data-input="set" data-f="shopName"></label>
        <label class="fld"><span>Owner name</span><input value="${esc(s.ownerName || '')}" data-input="set" data-f="ownerName"></label>
        <label class="fld"><span>Phone (shows on bill)</span><input value="${esc(s.phone || '')}" data-input="set" data-f="phone"></label>
        <label class="fld wide"><span>Address</span><input value="${esc(s.address || '')}" data-input="set" data-f="address"></label>
        <label class="fld"><span>GSTIN</span><input value="${esc(s.gstin || '')}" data-input="set" data-f="gstin" placeholder="leave blank if not registered"></label>
        <label class="fld"><span>Default GST % on new items</span><input type="number" step="any" value="${num(s.defaultGst || 0)}" data-input="set" data-f="defaultGst" data-num="1"></label>
      </div>`)}

    ${card('Billing preferences', `
      <div class="form-grid">
        <label class="fld"><span>Invoice prefix</span><input value="${esc(s.invoicePrefix)}" data-input="set" data-f="invoicePrefix"></label>
        <label class="fld"><span>Next invoice number</span><input type="number" value="${num(s.nextInvoiceNo)}" data-input="set" data-f="nextInvoiceNo" data-num="1"></label>
        <label class="fld"><span>Low-stock alert default</span><input type="number" step="any" value="${num(s.lowStockDefault)}" data-input="set" data-f="lowStockDefault" data-num="1"></label>
        <label class="fld"><span>Payment modes (comma separated)</span><input value="${esc((s.paymentModes || []).join(', '))}" data-input="set" data-f="paymentModes"></label>
        <label class="fld wide"><span>Bill footer / terms</span><input value="${esc(s.terms || '')}" data-input="set" data-f="terms"></label>
        <label class="check"><input type="checkbox" ${s.taxEnabled ? 'checked' : ''} data-change="set-bool" data-f="taxEnabled"> Show GST / tax columns</label>
        <label class="check"><input type="checkbox" ${s.priceIncludesTax ? 'checked' : ''} data-change="set-bool" data-f="priceIncludesTax"> My selling rates already include GST (MRP style)</label>
        <label class="check"><input type="checkbox" ${s.roundOff ? 'checked' : ''} data-change="set-bool" data-f="roundOff"> Round off grand total</label>
      </div>
      <p class="note-line">Changing the invoice number here only affects the next bill — old bills keep their numbers.</p>`)}

    ${card('WhatsApp', `
      <div class="form-grid">
        <label class="fld"><span>Country code</span><input value="${esc(s.countryCode || '91')}" data-input="set" data-f="countryCode" placeholder="91"></label>
        <label class="fld"><span>Open WhatsApp using</span>
          <select data-change="set" data-f="waMode">
            <option value="auto" ${s.waMode === 'auto' ? 'selected' : ''}>Automatic — WhatsApp Web on PC, app on phone</option>
            <option value="web" ${s.waMode === 'web' ? 'selected' : ''}>WhatsApp Web (web.whatsapp.com)</option>
            <option value="app" ${s.waMode === 'app' ? 'selected' : ''}>WhatsApp app / wa.me link</option>
          </select></label>
        <label class="check"><input type="checkbox" ${s.waAutoCopy ? 'checked' : ''} data-change="set-bool" data-f="waAutoCopy"> Also copy the message to the clipboard</label>
      </div>
      <p class="note-line">On <b>this</b> device the button opens <b>${isMobileDevice() ? 'the WhatsApp app (wa.me link)' : 'WhatsApp Web (web.whatsapp.com)'}</b>.
      Keep WhatsApp Web logged in on the counter PC (scan the QR once) — then a bill opens in the customer's chat with everything already typed, you only press Send.
      Numbers saved as 10 digits automatically get “${esc(s.countryCode || '91')}” added.</p>
      <div class="modal-actions left"><button class="btn ghost sm" data-act="wa-test">Try it now</button></div>`)}

    ${card('Customer portal', (() => {
      const withLogin = S.customers.filter((c) => c.portal);
      const link = portalLink();
      return `
      <div class="form-grid">
        <label class="fld wide"><span>Portal link to send customers</span>
          <input value="${esc(link)}" readonly id="portal-link-field"></label>
      </div>
      <label class="check" style="padding:0 15px 6px"><input type="checkbox" ${S.settings.portalEnabled !== false ? 'checked' : ''}
        data-change="portal-toggle"> Customer portal is open (customers can log in)</label>
      <div class="modal-actions left">
        <button class="btn primary sm" data-act="portal-copy-link">Copy link</button>
        <button class="btn ghost sm" data-act="portal-open">Open portal</button>
        ${DB.mode === 'firebase' ? `<button class="btn ghost sm" data-act="portal-publish">Publish shop details</button>` : ''}
      </div>
      <div class="mini-stats four">
        <div><small>Customers with login</small><b>${withLogin.length}</b></div>
        <div><small>Total customers</small><b>${S.customers.length}</b></div>
        <div><small>Login system</small><b>${DB.mode === 'firebase' ? 'Firebase Auth' : 'Local (unsafe)'}</b></div>
        <div><small>Customer can see</small><b>Own khata only</b></div>
      </div>
      <p class="note-line">
        <b>How it works:</b> open Khata → a customer → <b>Create login</b>. Give them the ID + password and the link above —
        the app can send it on WhatsApp for you. The customer then sees <b>only their own</b> balance, bills, payment history and statement.
        Have a look yourself: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>
      </p>
      ${DB.mode === 'firebase' ? `<p class="note-line">Security: customers get real Firebase logins and <code>firestore.rules</code> lets them read only their own records —
        publish the rules file from Settings → Setup guide before handing out logins.</p>`
      : `<p class="note-line warn-t"><b>Local mode:</b> logins are checked inside this browser, so anyone using this PC can also open the shop app.
        Connect Firebase before giving customers logins.</p>`}`;
    })())}

    ${(can('data') || can('settings')) ? card('Data', `
      <div class="mini-stats four">
        <div><small>Items</small><b>${counts.products}</b></div>
        <div><small>Customers</small><b>${counts.customers}</b></div>
        <div><small>Bills</small><b>${counts.invoices}</b></div>
        <div><small>Payments</small><b>${counts.payments}</b></div>
      </div>
      <div class="modal-actions left">
        <button class="btn ghost" data-act="backup-json">${icon('download')} Download full backup (JSON)</button>
        <button class="btn ghost" data-act="restore-json">${icon('up')} Restore from backup</button>
        <button class="btn ghost" data-act="export-all-csv">${icon('download')} All data as CSV</button>
      </div>
      <div class="modal-actions left">
        <button class="btn ghost" data-act="seed-demo">Load demo items & customers</button>
        <button class="btn danger" data-act="wipe-data">${icon('trash')} Delete ALL data</button>
      </div>
      <p class="note-line">Backup includes items, customers, bills, payments and the stock log. Keep a copy on your phone/PC every week.</p>`) : ''}

    ${card('Connection & account', `
      <div class="conn ${DB.mode === 'firebase' ? 'ok' : 'warn'}">
        ${icon(DB.mode === 'firebase' ? 'cloud' : 'warn')}
        <div>
          <b>${DB.mode === 'firebase' ? 'Firebase connected' : 'Local mode (this browser only)'}</b>
          <small>${DB.mode === 'firebase'
            ? `Signed in as ${esc((DB.user && DB.user.email) || '—')} · syncing live with Firestore`
            : 'Fill in FIREBASE_CONFIG inside index.html to sync across devices and keep a cloud backup.'}</small>
        </div>
        ${DB.mode === 'firebase' ? `<button class="btn ghost sm" data-act="signout">Sign out</button>` : `<button class="btn sm" data-act="setup-help">Setup guide</button>`}
      </div>
      <p class="note-line">Tip: install this app on your phone — open it in Chrome and choose <b>Menu → Add to Home screen</b>. It then works like a normal app, even offline.</p>`)}

    <p class="foot-note">Wholesale Billing · single-file app · your data belongs to you.</p>
  </div>`;
};

/* ---- settings interactions (debounced so we don't spam Firestore) ---- */
const saveSetDebounced = debounce(async () => { await ACT.saveSettings({}, S); }, 900);
ACTIONS['set'] = (el) => {
  if (!requirePerm('settings', 'change settings')) return;
  const f = el.dataset.f;
  let v = el.value;
  if (el.dataset.num) v = num(v);
  if (f === 'paymentModes') v = v.split(',').map((x) => x.trim()).filter(Boolean);
  if (f === 'invoicePrefix') v = v;
  S.settings[f] = v;
  saveSetDebounced();
  if (f === 'nextInvoiceNo' || f === 'invoicePrefix') UI.toast('Saved');
};
ACTIONS['set-bool'] = async (el) => {
  if (!requirePerm('settings', 'change settings')) return;
  const f = el.dataset.f;
  S.settings[f] = el.checked;
  await ACT.saveSettings({}, S);
  UI.toast('Saved');
  render();
};

/* ---- backup / restore ---- */
ACTIONS['backup-json'] = () => {
  if (!requirePerm('data', 'use backup / data tools')) return;
  const data = {
    exportedAt: new Date().toISOString(), app: 'wholesale-billing', version: 1,
    settings: S.settings, products: S.products, customers: S.customers,
    invoices: S.invoices, payments: S.payments, moves: S.moves
  };
  download(`backup_${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  UI.toast('Backup downloaded — keep it safe');
};

ACTIONS['restore-json'] = () => {
  if (!requirePerm('data', 'use backup / data tools')) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    let d;
    try { d = JSON.parse(text); } catch (e) { return UI.toast('That file is not valid JSON', 'warn'); }
    if (!d || !d.products) return UI.toast('This backup file looks wrong', 'warn');
    if (!confirm(`Restore backup from ${d.exportedAt ? new Date(d.exportedAt).toLocaleString() : 'file'}?\n\nItems: ${(d.products || []).length}\nCustomers: ${(d.customers || []).length}\nBills: ${(d.invoices || []).length}\n\nThis MERGES with your current data (same IDs are overwritten).`)) return;
    UI.toast('Restoring…', 'ok', 1500);
    const jobs = [];
    if (d.settings) jobs.push(ACT.saveSettings({ ...d.settings }, S));
    ['products', 'customers', 'invoices', 'payments', 'moves'].forEach((c) => {
      (d[c] || []).forEach((obj) => jobs.push(ACT.save(c, obj, S, true)));
    });
    await Promise.all(jobs);
    UI.toast('Backup restored ✓');
    render();
  };
  input.click();
};

ACTIONS['export-all-csv'] = () => {
  ACTIONS['export-invoices']();
  setTimeout(() => ACTIONS['export-khata'](), 400);
  setTimeout(() => ACTIONS['export-products'](), 800);
  setTimeout(() => ACTIONS['export-moves'](), 1200);
  setTimeout(() => ACTIONS['export-payments'](), 1600);
};

ACTIONS['seed-demo'] = async () => {
  if (!requirePerm('data', 'use backup / data tools')) return;
  if (!confirm('Add demo items (10) and demo customers (4) to try the app out?\n\nYou can delete them later. No bills will be created.')) return;
  await seedDemo();
  render();
  UI.toast('Demo data added ✓');
};

ACTIONS['wipe-data'] = async () => {
  if (!requirePerm('data', 'use backup / data tools')) return;
  const phrase = prompt('This deletes EVERYTHING (items, customers, bills, payments, stock log) permanently.\n\nType DELETE to confirm:');
  if (phrase !== 'DELETE') return UI.toast('Cancelled');
  UI.toast('Deleting…', 'ok', 2000);
  if (DB.mode === 'firebase') { try { await DB.wipeRemote(); } catch (e) { console.error(e); } }
  S.products = []; S.customers = []; S.invoices = []; S.payments = []; S.moves = [];
  S.settings = { ...DEFAULT_SETTINGS, shopName: S.settings.shopName, phone: S.settings.phone, gstin: S.settings.gstin, address: S.settings.address, seeded: true };
  DB.mirror(S);
  await ACT.saveSettings({}, S);
  render();
  UI.toast('All data deleted');
};

ACTIONS['setup-help'] = () => {
  UI.openModal('Connect Firebase (3 steps)', `
    <p>Right now everything is saved in this browser only. To sync between your phone, counter PC and take automatic backups, connect Firebase — free for a shop of your size.</p>
    <ol class="steps">
      <li><b>Create a project</b><br>Go to <code>console.firebase.google.com</code> → Add project (name: my-wholesale-store).</li>
      <li><b>Enable login & database</b><br>Build → Authentication → Sign-in method → enable <b>Email/Password</b>, then create a user with your email + a password (that is your login for this app).<br>
          Build → Firestore Database → Create database → <b>Production mode</b> → location <i>asia-south1 (Mumbai)</i>.</li>
      <li><b>Paste your config</b><br>Project settings (⚙️) → Your apps → Web app → copy the <code>firebaseConfig</code> values into <code>FIREBASE_CONFIG</code> at the top of <code>index.html</code>, then re-upload to GitHub.</li>
    </ol>
    <h4>Firestore security rules</h4>
    <pre class="code">rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}</pre>
    <p class="note-line">These rules mean: only a signed-in user can read/write. Never enable "test mode" rules permanently — anyone could read your data.</p>
    <div class="modal-actions"><button class="btn primary" data-act="modal-close">Got it</button></div>`);
};

ACTIONS['portal-toggle'] = async (el) => {
  await ACT.saveSettings({ portalEnabled: el.checked }, S);
  UI.toast(el.checked ? 'Customer portal is open' : 'Customer portal switched off — logins stop working', el.checked ? 'ok' : 'warn', 4000);
  render();
};
ACTIONS['portal-copy-link'] = async () => {
  const ok = await copyText(portalLink());
  UI.toast(ok ? 'Portal link copied — paste it in WhatsApp' : portalLink(), ok ? 'ok' : 'warn', 6000);
};
ACTIONS['portal-open'] = () => { location.hash = 'customer'; location.reload(); };
ACTIONS['portal-publish'] = async () => {
  const ok = await DB.publishShopInfo(S.settings);
  UI.toast(ok ? 'Shop name, phone and address published to the portal ✓' : 'Could not publish (check internet / rules)', ok ? 'ok' : 'warn', 6000);
};

ACTIONS['signout'] = async () => {
  if (!confirm('Sign out on this device?')) return;
  await DB.logout();
  render();
};
