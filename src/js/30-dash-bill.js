/* =========================================================================
   VIEWS — Dashboard + New Bill (billing screen)
   ========================================================================= */
const VIEWS = {};

/* ------------------------------- DASHBOARD ------------------------------- */
VIEWS.dash = function () {
  const today = todayISO();
  const todaysInv = S.invoices.filter((i) => i.date === today);
  const todaysPay = S.payments.filter((p) => p.date === today);
  const salesToday = round2(todaysInv.reduce((s, i) => s + num(i.totals ? i.totals.grand : i.total), 0));
  const cashAtBilling = round2(todaysInv.reduce((s, i) => s + num(i.paidAtSale), 0));
  const collectToday = round2(todaysPay.reduce((s, p) => s + num(p.amount), 0) + cashAtBilling);
  const receivable = receivableTotal();
  const low = S.products.filter(isLowStock);
  const sv = stockValue(S.products);
  const dues = dueCustomers(S.customers, S.invoices, S.payments).slice(0, 6);
  const recent = S.invoices.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

  const k1 = can('reports') ? kpi("Today's sales", money(salesToday), `${todaysInv.length} bill${todaysInv.length === 1 ? '' : 's'}`, 'accent', 'tab', 'data-tab="bill"')
    : kpi('Bills today', String(todaysInv.length), 'billing screen', 'accent', 'tab', 'data-tab="bill"');
  const k2 = can('payment') ? kpi('Collected today', money(collectToday), `${money(cashAtBilling)} at billing`, 'ok', 'tab', 'data-tab="payments"') : '';
  const k3 = can('khata') ? kpi('Total to receive', money(receivable), `${dues.length ? dues.length + '+ customers' : 'All clear'}`, receivable > 0 ? 'warn' : 'ok', 'tab', `data-tab="khata"`) : '';
  const k4 = can('stock') && can('cost') ? kpi('Stock value', money(sv), `${low.length} item${low.length === 1 ? '' : 's'} low`, low.length ? 'bad' : '', 'tab', 'data-tab="products"')
    : can('stock') ? kpi('Low stock items', String(low.length), 'need reorder', low.length ? 'warn' : 'ok', 'tab', 'data-tab="products"') : '';
  return `
  <div class="view">
    <div class="grid kpis">
      ${k1}${k2}${k3}${k4 || kpi('Signed in as', esc(sessionLabel()), esc(roleById(S.session ? S.session.role : 'owner').label), '', 'tab', 'data-tab="dash"')}
    </div>

    <div class="quick">
      ${can('bill') ? `<button class="quick-btn" data-act="tab" data-tab="bill">${icon('bill')}<span>New Bill</span></button>` : ''}
      ${can('payment') ? `<button class="quick-btn" data-act="pay-modal">${icon('cash')}<span>Take Payment</span></button>` : ''}
      ${can('stock') ? `<button class="quick-btn" data-act="stock-in-modal">${icon('pkg')}<span>Stock In</span></button>` : ''}
      ${can('khata') ? `<button class="quick-btn" data-act="cust-modal">${icon('user')}<span>Add Customer</span></button>` : ''}
    </div>

    ${card('Customers with pending balance', dues.length ? `<div class="list">${dues.map((d) => `
        <div class="row" data-act="open-customer" data-id="${d.customer.id}">
          <div class="avatar">${esc(d.customer.name.slice(0, 1).toUpperCase())}</div>
          <div class="row-main"><b>${esc(d.customer.name)}</b><small>${esc(d.customer.phone || 'no phone')}</small></div>
          <div class="row-right"><b class="${d.balance > 0 ? 'warn-t' : 'ok-t'}">${money(Math.abs(d.balance))}</b>
            <small>${d.balance > 0 ? 'to receive' : 'advance paid'}</small></div>
        </div>`).join('')}</div>` : `<div class="pad muted">No pending balance. 🎉</div>`,
    `<button class="btn ghost sm" data-act="tab" data-tab="khata">All khatas</button>`)}

    <div class="two-col">
      ${card("Today's bills", todaysInv.length ? `<div class="list">${todaysInv.map((i) => `
          <div class="row" data-act="view-invoice" data-id="${i.id}">
            <div class="row-main"><b>${esc(i.no)}</b><small>${esc(i.customerName || 'Cash')} · ${(i.lines || []).length} items${i.createdByName ? ' · by ' + esc(i.createdByName) : ''}</small></div>
            <div class="row-right"><b>${money(i.total)}</b>${statusPill(num(i.paidAtSale) >= num(i.total) - 0.004 ? 'paid' : num(i.paidAtSale) > 0 ? 'partial' : 'credit')}</div>
            <button class="icon-btn" data-act="wa-invoice" data-id="${i.id}" title="Send on WhatsApp">${icon('wa')}</button>
          </div>`).join('')}</div>` : `<div class="pad muted">No bills yet today.</div>`)}

      ${card('Low stock items', low.length ? `<div class="list">${low.slice(0, 6).map((p) => `
          <div class="row" data-act="open-product" data-id="${p.id}">
            <div class="row-main"><b>${esc(p.name)}</b><small>alert at ${qtyFmt(p.lowStock)} ${esc(p.unit)}</small></div>
            <div class="row-right"><b class="bad-t">${qtyFmt(p.stock)} ${esc(p.unit)}</b><small>${p.code ? esc(p.code) : ''}</small></div>
          </div>`).join('')}</div>` : `<div class="pad muted">Everything is above its alert level.</div>`,
      `<button class="btn ghost sm" data-act="tab" data-tab="products">Stock</button>`)}

      ${card('Recent bills', recent.length ? `<div class="list">${recent.map((i) => `
          <div class="row" data-act="view-invoice" data-id="${i.id}">
            <div class="row-main"><b>${esc(i.no)}</b><small>${fmtDateShort(i.date)} · ${esc(i.customerName || 'Cash')}</small></div>
            <div class="row-right"><b>${money(i.total)}</b></div>
            <button class="icon-btn" data-act="wa-invoice" data-id="${i.id}" title="Send on WhatsApp">${icon('wa')}</button>
          </div>`).join('')}</div>` : `<div class="pad muted">No bills yet. Create your first bill →</div>`)}

      ${can('reports') ? card('Month at a glance', (() => {
        const from = today.slice(0, 8) + '01';
        const r = reportRange(S, from, today);
        return `<div class="mini-stats">
            <div><small>Sales</small><b>${money(r.sales)}</b></div>
            <div><small>Collected</small><b>${money(r.collected + round2(r.invoices.reduce((s, i) => s + num(i.paidAtSale), 0)))}</b></div>
            <div><small>Credit given</small><b>${money(r.creditGiven)}</b></div>
            <div><small>Bills</small><b>${r.billCount}</b></div>
          </div>`;
      })(), `<button class="btn ghost sm" data-act="tab" data-tab="reports">Reports</button>`) : ''}
    </div>
  </div>`;
};

/* ------------------------------- NEW BILL ------------------------------- */
VIEWS.bill = function () {
  if (!S.bill) S.bill = blankBill();
  const b = S.bill;
  if (!b.no) b.no = nextBillNo();
  const cust = findCustomer(b.customerId);
  const t = computeInvoice(b.lines, b.disc, taxOpts()).totals;
  const custBal = cust ? customerBalance(cust, S.invoices, S.payments) : 0;

  const lineRows = b.lines.map((l, i) => {
    const c = computeLine(l, taxOpts());
    const p = l.productId ? findProduct(l.productId) : null;
    const boxOk = p && num(p.ppb) > 1 && p.unit !== 'kg' && p.unit !== 'ltr';
    return `<div class="bill-line">
      <div class="bl-name">
        <b>${esc(l.name)}</b>
        <small>${p ? `stock ${packDisplay(p.stock, p.ppb, p.unit)}${l.sellUnit === 'box' ? ` · 1 box = ${qtyFmt(p.ppb)} ${esc(p.unit)}` : ''}` : 'custom item (not linked to stock)'}</small>
      </div>
      <div class="bl-fields">
        <label class="fld sm"><span>Qty</span>
          <input type="number" inputmode="decimal" step="any" min="0" value="${l.qty}"
                 data-input="bill-line" data-i="${i}" data-f="qty"></label>
        <label class="fld sm"><span>Unit</span>
          <select data-change="bill-line" data-i="${i}" data-f="sellUnit" ${boxOk ? '' : 'disabled'}>
            <option value="unit" ${l.sellUnit !== 'box' ? 'selected' : ''}>${esc(p ? p.unit : l.unit || 'pcs')}</option>
            ${boxOk ? `<option value="box" ${l.sellUnit === 'box' ? 'selected' : ''}>box</option>` : ''}
          </select></label>
        <label class="fld sm"><span>Rate</span>
          <input type="number" inputmode="decimal" step="any" min="0" value="${l.rate}"
                 data-input="bill-line" data-i="${i}" data-f="rate"></label>
        <label class="fld sm"><span>Disc %</span>
          <input type="number" inputmode="decimal" step="any" min="0" max="100" value="${l.discPct || 0}"
                 data-input="bill-line" data-i="${i}" data-f="discPct"></label>
        ${S.settings.taxEnabled ? `<label class="fld sm"><span>GST %</span>
          <input type="number" inputmode="decimal" step="any" min="0" value="${l.gstPct || 0}"
                 data-input="bill-line" data-i="${i}" data-f="gstPct"></label>` : ''}
        <div class="bl-total"><span>Amount</span><b id="lt_${i}">${money(c.total)}</b></div>
        <button class="icon-btn danger" data-act="bill-remove-line" data-i="${i}" title="Remove">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="view">
    ${card('', `
      <div class="bill-top">
        <label class="fld"><span>Customer (khata)</span>
          <select data-change="bill-customer">${customerOptions(b.customerId)}</select>
        </label>
        <button class="btn ghost" data-act="cust-modal-from-bill">${icon('plus')} New customer</button>
        <label class="fld"><span>Bill date</span>
          <input type="date" value="${b.date}" data-input="bill-field" data-f="date">
        </label>
        <label class="fld"><span>Bill no.</span>
          <input value="${esc(b.no)}" data-input="bill-field" data-f="no">
        </label>
      </div>
      ${cust ? `<div class="cust-strip ${custBal > 0 ? 'warn' : 'ok'}">
          ${icon('user')} <b>${esc(cust.name)}</b>
          <span class="muted">${esc(cust.phone || '')}</span>
          <span class="spacer"></span>
          <span>${custBal > 0 ? `Pending khata: <b>${money(custBal)}</b>` : custBal < 0 ? `Advance: <b>${money(-custBal)}</b>` : 'No pending balance'}</span>
          <button class="btn ghost sm" data-act="open-customer" data-id="${cust.id}">View khata</button>
        </div>` : `<div class="cust-strip plain">${icon('user')} <span>Walk-in / cash customer — bill will not be added to any khata.</span></div>`}
    `)}

    ${card('Items', `
      <div class="item-search">
        ${icon('search')}
        <input id="bill-search" placeholder="Search item by name or code…  (type & press Enter)" data-input="bill-search" data-search-focus autocomplete="off">
        <button class="btn ghost sm" data-act="bill-custom-item" type="button">＋ Custom item</button>
        <button class="btn ghost sm" data-act="prod-modal-from-bill" type="button">＋ New item</button>
      </div>
      <div id="bill-sugg" class="sugg"></div>
      ${b.lines.length ? `<div class="bill-lines">${lineRows}</div>` : `<div class="pad muted">No items yet — search above to add.</div>`}
    `)}

    <div class="two-col bill-bottom">
      ${card('Discount & payment', `
        <div class="form-grid">
          <label class="fld"><span>Bill discount type</span>
            <select data-change="bill-disc" data-f="type">
              <option value="none" ${b.disc.type === 'none' ? 'selected' : ''}>No discount</option>
              <option value="pct" ${b.disc.type === 'pct' ? 'selected' : ''}>Percent %</option>
              <option value="amt" ${b.disc.type === 'amt' ? 'selected' : ''}>Amount ${CUR}</option>
            </select></label>
          <label class="fld"><span>Discount value</span>
            <input type="number" inputmode="decimal" step="any" min="0" value="${b.disc.value || 0}" data-input="bill-disc" data-f="value" ${b.disc.type === 'none' ? 'disabled' : ''}></label>
          <label class="fld"><span>Received now (optional)</span>
            <input type="number" inputmode="decimal" step="any" min="0" value="${b.paidNow || ''}" placeholder="0" data-input="bill-field" data-f="paidNow"></label>
          <label class="fld"><span>Payment mode</span>
            <select data-change="bill-field" data-f="payMode">
              ${(S.settings.paymentModes || ['Cash']).map((m) => `<option ${m === b.payMode ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select></label>
          <label class="fld wide"><span>Note / remarks</span>
            <input value="${esc(b.note || '')}" placeholder="optional" data-input="bill-field" data-f="note"></label>
        </div>
      `)}
      <div class="card totals-card">
        <div id="bill-totals">${billTotalsHTML(b, t, custBal)}</div>
        <div class="save-actions">
          <button class="btn primary big" data-act="bill-save" ${b.lines.length ? '' : 'disabled'}>${icon('check')} ${b._editing ? 'Update bill' : 'Save bill'}</button>
          <button class="btn ghost" data-act="bill-clear">Clear</button>
        </div>
      </div>
    </div>
  </div>`;
};

function billTotalsHTML(b, t, custBal) {
  const paid = Math.min(num(b.paidNow), t.grand);
  const pending = round2(t.grand - paid);
  return `
    <div class="tot-row"><span>Items total (${b.lines.length})</span><b>${money(t.gross)}</b></div>
    ${t.itemDiscount ? `<div class="tot-row"><span>Item discounts</span><b>-${money(t.itemDiscount)}</b></div>` : ''}
    ${t.billDiscount ? `<div class="tot-row"><span>Bill discount</span><b>-${money(t.billDiscount)}</b></div>` : ''}
    ${S.settings.taxEnabled ? `<div class="tot-row"><span>Taxable value</span><b>${money(t.subtotal)}</b></div>
      <div class="tot-row"><span>GST</span><b>${money(t.tax)}</b></div>${S.settings.priceIncludesTax ? '<div class="note-line">Rates are tax-inclusive</div>' : ''}` : ''}
    ${t.roundOff ? `<div class="tot-row"><span>Round off</span><b>${t.roundOff > 0 ? '+' : '-'}${money(Math.abs(t.roundOff), false)}</b></div>` : ''}
    <div class="tot-row grand"><span>Grand total</span><b>${money(t.grand)}</b></div>
    ${paid > 0 ? `<div class="tot-row ok-t"><span>Received now</span><b>${money(paid)}</b></div>` : ''}
    <div class="tot-row ${pending > 0 ? 'warn-t' : 'ok-t'}"><span>${pending > 0 ? 'Goes to khata (pending)' : 'Fully paid'}</span><b>${money(Math.max(0, pending))}</b></div>
    ${custBal ? `<div class="tot-row muted"><span>Khata balance after this bill</span><b>${money(custBal + pending)}</b></div>` : ''}
    <div class="tot-row muted small"><span>Qty in bill</span><b>${qtyFmt(t.qty)}</b></div>`;
}

/* ---- billing interactions ---- */
function refreshBill() {
  const b = S.bill;
  const t = computeInvoice(b.lines, b.disc, taxOpts()).totals;
  const cust = findCustomer(b.customerId);
  const custBal = cust ? customerBalance(cust, S.invoices, S.payments) : 0;
  const host = document.getElementById('bill-totals');
  if (host) host.innerHTML = billTotalsHTML(b, t, custBal);
  b.lines.forEach((l, i) => {
    const el = document.getElementById('lt_' + i);
    if (el) el.textContent = money(computeLine(l, taxOpts()).total);
  });
}

ACTIONS['bill-customer'] = (el) => { S.bill.customerId = el.value; render(); };
ACTIONS['cust-modal-from-bill'] = () => customerModal(null, () => render());

ACTIONS['bill-field'] = (el) => {
  const f = el.dataset.f;
  let v = el.value;
  if (f === 'paidNow') v = num(v);
  S.bill[f] = v;
  if (['paidNow', 'no', 'note', 'date'].includes(f)) refreshBill();
  if (f === 'no') S.bill.no = v;
};

ACTIONS['bill-disc'] = (el) => {
  const b = S.bill;
  b.disc[el.dataset.f] = el.dataset.f === 'value' ? num(el.value) : el.value;
  if (el.dataset.f === 'type') {
    const input = document.querySelector('[data-input="bill-disc"]');
    if (input) input.disabled = b.disc.type === 'none';
  }
  refreshBill();
};

ACTIONS['bill-line'] = (el, ev) => {
  const i = +el.dataset.i, f = el.dataset.f;
  const l = S.bill.lines[i];
  if (!l) return;
  if (f === 'sellUnit') {
    const p = findProduct(l.productId);
    l.sellUnit = el.value;
    if (p && el.value === 'box' && num(p.ppb) > 1) l.rate = round2(num(p.price) * num(p.ppb));
    if (p && el.value !== 'box') l.rate = num(p.price);
    render();
    return;
  }
  if (['qty', 'rate', 'discPct', 'gstPct'].includes(f)) l[f] = num(el.value);
  if (f === 'name') l.name = el.value;
  refreshBill();
};

ACTIONS['bill-remove-line'] = (el) => {
  S.bill.lines.splice(+el.dataset.i, 1);
  render();
};

ACTIONS['bill-save'] = async () => {
  if (!requirePerm('bill', 'make bills')) return;
  const b = S.bill;
  if (!b.lines.length) return UI.toast('Add at least one item', 'warn');
  const cust = findCustomer(b.customerId);
  const calc = computeInvoice(b.lines, b.disc, taxOpts());
  const t = calc.totals;
  const paidNow = Math.min(num(b.paidNow), t.grand);
  const inv = {
    id: b.id, no: b.no || nextBillNo(), date: b.date || todayISO(),
    customerId: b.customerId || '', customerName: cust ? cust.name : 'Cash',
    lines: calc.rows.map((r, i) => ({
      productId: r.productId, name: r.name, hsn: r.hsn, unit: r.unit, sellUnit: r.sellUnit, ppb: r.ppb,
      qty: r.qty, rate: r.rate, discPct: r.discPct, gstPct: r.gstPct, cost: r.cost,
      gross: r.gross, disc: r.disc, taxable: r.taxable, tax: r.tax, total: r.total
    })),
    disc: { ...b.disc }, note: b.note || '', paidAtSale: paidNow, payMode: paidNow > 0 ? b.payMode : '',
    totals: { gross: t.gross, itemDiscount: t.itemDiscount, billDiscount: t.billDiscount, subtotal: t.subtotal, tax: t.tax, total: t.total, roundOff: t.roundOff, grand: t.grand, cost: t.cost, qty: t.qty, taxBreakup: t.taxBreakup },
    total: t.grand, tax: t.tax, taxBreakup: t.taxBreakup,
    createdBy: (S.session && S.session.email) || (DB.user && DB.user.email) || 'local',
    createdByName: sessionLabel() || 'Owner'
  };
  const isEdit = !!b._editing;
  await ACT.saveInvoice(inv, S, isEdit);
  const settings = { ...S.settings };
  const n = parseInt(String(inv.no).match(/(\d+)\s*$/)?.[1] || '0', 10);
  if (n >= num(settings.nextInvoiceNo)) { settings.nextInvoiceNo = n + 1; await ACT.saveSettings({ nextInvoiceNo: n + 1 }, S); }
  S.bill = blankBill();
  S.tab = 'invoices';
  render();
  showSavedPanel(inv);
};

ACTIONS['bill-clear'] = () => {
  S.bill = blankBill();
  render();
  UI.toast('Bill cleared');
};

/* ---- item search + adding lines ---- */
function addProductLine(p, qty) {
  const b = S.bill;
  const existing = b.lines.find((l) => l.productId === p.id && l.sellUnit !== 'box');
  if (existing) { existing.qty = round2(num(existing.qty) + num(qty)); render(); UI.toast(`${p.name}: now ${qtyFmt(existing.qty)} ${p.unit}`); return; }
  b.lines.push({
    productId: p.id, name: p.name, hsn: p.hsn || '', unit: p.unit || 'pcs', sellUnit: 'unit', ppb: num(p.ppb),
    qty: num(qty) || 1, rate: num(p.price), discPct: 0, gstPct: num(p.gst), cost: num(p.cost)
  });
  render();
}
function addCustomLine() {
  const name = prompt('Item name (not linked to stock):');
  if (!name) return;
  const rate = num(prompt('Rate (price per unit):', '0'));
  S.bill.lines.push({ productId: '', name: name.trim(), unit: 'pcs', sellUnit: 'unit', ppb: 0, qty: 1, rate, discPct: 0, gstPct: num(S.settings.defaultGst), cost: 0 });
  render();
}
ACTIONS['bill-custom-item'] = addCustomLine;
ACTIONS['prod-modal-from-bill'] = () => productModal(null, () => render());

ACTIONS['bill-search'] = (el) => {
  const q = el.value.trim().toLowerCase();
  const host = document.getElementById('bill-sugg');
  if (!host) return;
  if (!q) { host.innerHTML = ''; return; }
  const words = q.split(/\s+/);
  const hits = S.products.filter((p) => {
    const hay = (p.name + ' ' + (p.code || '') + ' ' + (p.brand || '') + ' ' + (p.category || '')).toLowerCase();
    return words.every((w) => hay.includes(w));
  }).sort((a, b) => num(b.stock) - num(a.stock)).slice(0, 8);
  host.innerHTML = hits.length ? hits.map((p) => `
      <div class="sugg-row" data-act="bill-add-item" data-id="${p.id}">
        <div><b>${esc(p.name)}</b><small>${p.code ? esc(p.code) + ' · ' : ''}${packDisplay(p.stock, p.ppb, p.unit)} in stock</small></div>
        <div class="right"><b>${money(p.price)}</b><small>per ${esc(p.unit)}${num(p.ppb) > 1 ? ` · box ${money(round2(num(p.price) * num(p.ppb)))}` : ''}</small></div>
      </div>`).join('')
    : `<div class="sugg-row none">No item matched "<b>${esc(el.value)}</b>". <button class="btn ghost sm" data-act="bill-custom-item" type="button">Add as custom item</button></div>`;
};
ACTIONS['bill-add-item'] = (el) => {
  const p = findProduct(el.dataset.id);
  if (!p) return;
  addProductLine(p, 1);
  const s = document.getElementById('bill-search');
  if (s) { s.value = ''; s.focus(); }
  const h = document.getElementById('bill-sugg');
  if (h) h.innerHTML = '';
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'bill-search') {
    const first = document.querySelector('#bill-sugg .sugg-row[data-act="bill-add-item"]');
    if (first) { e.preventDefault(); ACTIONS['bill-add-item'](first); }
  }
});

/* ---- saved panel (after saving a bill) ---- */
function showSavedPanel(inv) {
  const cust = findCustomer(inv.customerId);
  const pending = round2(num(inv.total) - num(inv.paidAtSale));
  UI.openModal('Bill saved ✓', `
    <div class="saved">
      <div class="saved-big">${money(inv.total)}</div>
      <div class="muted">${esc(inv.no)} · ${esc(inv.customerName)} · ${fmtDate(inv.date)}</div>
      ${pending > 0 ? `<div class="pill warn" style="margin-top:8px">${money(pending)} added to khata</div>` : `<div class="pill ok" style="margin-top:8px">Fully paid</div>`}
      <div class="saved-actions">
        <button class="btn wa" data-act="wa-invoice" data-id="${inv.id}">${icon('wa')} Send bill on WhatsApp</button>
        <button class="btn ghost" data-act="print-invoice" data-id="${inv.id}">${icon('print')} Print bill</button>
        ${cust ? `<button class="btn ghost" data-act="open-customer" data-id="${cust.id}">Open khata</button>` : ''}
        <button class="btn ghost" data-act="modal-close">Done</button>
      </div>
      <p class="note-line">${cust ? (cust.phone ? 'Opens ' + esc(waUrl(cust.phone, 'x').split('?')[0].split('//')[1]) + ' with this bill already typed for ' + esc(cust.name) + '.' : 'No number saved for ' + esc(cust.name) + ' yet — the button will ask for it once.') : 'Cash bill — use Print, or open the bill later for a WhatsApp copy.'}</p>
    </div>`);
}
