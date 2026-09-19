/* =========================================================================
   VIEWS — Invoices (bills) list, invoice detail, printing, WhatsApp share
   ========================================================================= */

VIEWS.invoices = function () {
  const f = S.filters.inv;
  let list = S.invoices.slice();
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((i) => (i.no + ' ' + (i.customerName || '') + ' ' + (i.lines || []).map((l) => l.name).join(' ')).toLowerCase().includes(q));
  }
  if (f.from) list = list.filter((i) => i.date >= f.from);
  if (f.to) list = list.filter((i) => i.date <= f.to);
  if (f.cust) list = list.filter((i) => i.customerId === f.cust);
  const alloc = allocatePayments(S.invoices, S.payments);
  if (f.status) {
    list = list.filter((i) => {
      const a = alloc.byInvoice[i.id] || { status: 'paid' };
      return a.status === f.status;
    });
  }
  list.sort((a, b) => (a.date === b.date ? String(b.no).localeCompare(String(a.no)) : (a.date < b.date ? 1 : -1)));
  const sum = round2(list.reduce((s, i) => s + num(i.total), 0));
  const pend = round2(list.reduce((s, i) => s + ((alloc.byInvoice[i.id] || {}).due || 0), 0));

  return `<div class="view">
    ${card('', `
      <div class="filters">
        <div class="search-wrap">${icon('search')}
          <input placeholder="Search bill no, customer or item…" value="${esc(f.q)}" data-input="flt-inv" data-f="q" data-search-focus>
        </div>
        <label class="fld sm"><span>From</span><input type="date" value="${f.from}" data-input="flt-inv" data-f="from"></label>
        <label class="fld sm"><span>To</span><input type="date" value="${f.to}" data-input="flt-inv" data-f="to"></label>
        <label class="fld sm"><span>Customer</span><select data-change="flt-inv" data-f="cust">${customerOptions(f.cust)}</select></label>
        <label class="fld sm"><span>Status</span><select data-change="flt-inv" data-f="status">
          <option value="">All</option>
          <option value="unpaid" ${f.status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="partial" ${f.status === 'partial' ? 'selected' : ''}>Partial</option>
          <option value="paid" ${f.status === 'paid' ? 'selected' : ''}>Paid</option>
        </select></label>
        <button class="btn ghost sm" data-act="flt-clear" data-which="inv">Clear</button>
        <button class="btn ghost sm" data-act="export-invoices">${icon('download')} CSV</button>
      </div>
      <div class="stat-line"><span><b>${list.length}</b> bills</span><span>Total <b>${money(sum)}</b></span><span>Pending <b class="warn-t">${money(pend)}</b></span></div>
    `)}

    ${list.length ? card('', `<div class="list bills">${list.map((i) => {
      const a = alloc.byInvoice[i.id] || { due: 0, status: 'paid' };
      const isEditDate = i.updatedAt && i.updatedAt !== i.createdAt;
      return `<div class="row bill-row" data-act="view-invoice" data-id="${i.id}">
        <div class="row-main">
          <b>${esc(i.no)} ${statusPill(a.status)}</b>
          <small>${fmtDateShort(i.date)} · ${esc(i.customerName || 'Cash')} · ${(i.lines || []).length} items${isEditDate ? ' · edited' : ''}</small>
        </div>
        <div class="row-right">
          <b>${money(i.total)}</b>
          <small>${a.due > 0 ? `<span class="warn-t">${money(a.due)} pending</span>` : `<span class="ok-t">settled</span>`}</small>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-act="print-invoice" data-id="${i.id}" title="Print">${icon('print')}</button>
          <button class="icon-btn" data-act="wa-invoice" data-id="${i.id}" title="WhatsApp">${icon('wa')}</button>
          ${can('deleteBill') ? `<button class="icon-btn" data-act="edit-invoice" data-id="${i.id}" title="Edit">${icon('edit')}</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`)
      : card('', emptyState('No bills found for this filter.', 'New bill', 'new-bill', 'invoice'))}
  </div>`;
};

ACTIONS['new-bill'] = () => { S.bill = blankBill(); S.tab = 'bill'; render(); };
ACTIONS['flt-inv'] = (el) => { S.filters.inv[el.dataset.f] = el.value; render(); if (el.dataset.f === 'q') { const i = document.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } };
ACTIONS['flt-clear'] = (el) => { S.filters[el.dataset.which] = { q: '', from: '', to: '', cust: '', status: '' }; render(); };

/* ------------------------- invoice detail modal ------------------------- */
ACTIONS['view-invoice'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  const alloc = allocatePayments(S.invoices, S.payments).byInvoice[inv.id] || { due: 0, status: 'paid', paid: 0 };
  const cust = findCustomer(inv.customerId);
  const bal = cust ? customerBalance(cust, S.invoices, S.payments) : 0;
  UI.openModal('Bill ' + inv.no, `
    <div class="inv-view">
      <div class="inv-head">
        <div><small>Date</small><b>${fmtDate(inv.date)}</b></div>
        <div><small>Customer</small><b>${esc(inv.customerName || 'Cash')}</b></div>
        <div><small>Total</small><b>${money(inv.total)}</b></div>
        <div><small>Status</small><b>${statusPill(alloc.status)}</b></div>
      </div>
      <table class="mini-table">
        <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>${S.settings.taxEnabled ? '<th class="r">GST</th>' : ''}<th class="r">Amount</th></tr></thead>
        <tbody>${(inv.lines || []).map((l) => `<tr>
          <td>${esc(l.name)}${l.sellUnit === 'box' && num(l.ppb) > 1 ? `<small> (${qtyFmt(l.qty)} box × ${qtyFmt(l.ppb)} ${esc(l.unit)})</small>` : ''}</td>
          <td class="r">${qtyFmt(l.qty)} ${esc(l.sellUnit === 'box' ? 'box' : l.unit)}</td>
          <td class="r">${money(l.rate)}</td>
          ${S.settings.taxEnabled ? `<td class="r">${pct(l.gstPct)}%</td>` : ''}
          <td class="r">${money(l.total)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="inv-tots">
        <div><span>Items total</span><b>${money(num(inv.totals ? inv.totals.gross : inv.total))}</b></div>
        ${num(inv.totals && inv.totals.billDiscount) + num(inv.totals && inv.totals.itemDiscount) ? `<div><span>Discount</span><b>-${money(num(inv.totals.billDiscount) + num(inv.totals.itemDiscount))}</b></div>` : ''}
        ${S.settings.taxEnabled ? `<div><span>GST</span><b>${money(num(inv.totals ? inv.totals.tax : inv.tax))}</b></div>` : ''}
        <div class="grand"><span>Grand total</span><b>${money(inv.total)}</b></div>
        <div class="ok-t"><span>Paid at billing</span><b>${money(inv.paidAtSale)}</b></div>
        ${alloc.paid > 0 ? `<div class="ok-t"><span>Paid later</span><b>${money(alloc.paid)}</b></div>` : ''}
        <div class="${alloc.due > 0 ? 'warn-t' : 'ok-t'}"><span>Still pending on this bill</span><b>${money(alloc.due)}</b></div>
        ${cust ? `<div class="muted"><span>${esc(cust.name)}'s total khata balance</span><b>${money(bal)}</b></div>` : ''}
      </div>
      ${inv.note ? `<p class="note-line">Note: ${esc(inv.note)}</p>` : ''}
      ${inv.createdByName ? `<p class="note-line">Billed by: <b>${esc(inv.createdByName)}</b>${inv.createdBy && inv.createdBy !== inv.createdByName ? ' (' + esc(inv.createdBy) + ')' : ''}</p>` : ''}
      <div class="modal-actions">
        <button class="btn wa" data-act="wa-invoice" data-id="${inv.id}">${icon('wa')} Send bill on WhatsApp</button>
        <button class="btn primary" data-act="print-invoice" data-id="${inv.id}">${icon('print')} Print</button>
        ${alloc.due > 0 && cust ? `<button class="btn ghost" data-act="pay-modal" data-cust="${cust.id}" data-inv="${inv.id}">Take payment</button>` : ''}
        ${cust ? `<button class="btn ghost" data-act="open-customer" data-id="${cust.id}">Khata</button>` : ''}
        ${can('deleteBill') ? `<button class="btn ghost" data-act="edit-invoice" data-id="${inv.id}">${icon('edit')} Edit</button>
        <button class="btn danger" data-act="del-invoice" data-id="${inv.id}">${icon('trash')} Delete</button>` : ''}
      </div>
    </div>`, { wide: true });
};

/* ------------------------------ edit / delete ------------------------------ */
ACTIONS['edit-invoice'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  if (!requirePerm('deleteBill', 'edit bills')) return;
  UI.closeModal();
  S.bill = {
    id: inv.id, no: inv.no, date: inv.date, customerId: inv.customerId || '',
    lines: (inv.lines || []).map((l) => ({ ...l })),
    disc: { ...(inv.disc || { type: 'none', value: 0 }) },
    note: inv.note || '', paidNow: num(inv.paidAtSale), payMode: inv.payMode || 'Cash',
    _editing: true
  };
  S.tab = 'bill';
  render();
  UI.toast('Editing ' + inv.no + ' — stock will adjust automatically on save');
};

ACTIONS['del-invoice'] = async (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  if (!requirePerm('deleteBill', 'delete bills')) return;
  if (!confirm(`Delete bill ${inv.no} of ${money(inv.total)}?\n\nStock of all items will be returned to inventory. Payments recorded against this bill stay in the khata.`)) return;
  UI.closeModal();
  await ACT.deleteInvoice(inv, S);
  render();
};

/* ------------------------------ printing ------------------------------ */
function invoiceHTML(inv, mode) {
  const s = S.settings;
  const rows = (inv.lines || []).map((l, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(l.name)}${l.hsn ? `<div class="sm">HSN ${esc(l.hsn)}</div>` : ''}${l.sellUnit === 'box' && num(l.ppb) > 1 ? `<div class="sm">${qtyFmt(l.qty)} box × ${qtyFmt(l.ppb)} ${esc(l.unit)}</div>` : ''}</td>
      <td class="r">${qtyFmt(l.qty)} ${esc(l.sellUnit === 'box' ? 'box' : l.unit)}</td>
      <td class="r">${money(l.rate)}</td>
      ${num(l.discPct) ? `<td class="r">${pct(l.discPct)}%</td>` : '<td class="r">—</td>'}
      ${s.taxEnabled ? `<td class="r">${pct(l.gstPct)}%</td>` : ''}
      <td class="r b">${money(l.total)}</td>
    </tr>`).join('');
  const t = inv.totals || {};
  const cust = findCustomer(inv.customerId);
  const alloc = cust ? (allocatePayments(S.invoices, S.payments).byInvoice[inv.id] || { due: 0 }) : { due: round2(num(inv.total) - num(inv.paidAtSale)) };

  return `<div class="print-sheet">
    <div class="p-head">
      <div class="p-shop">
        <h2>${esc(s.shopName || 'My Wholesale Store')}</h2>
        <div class="sm">${esc(s.address || '')}${s.phone ? '<br>Ph: ' + esc(s.phone) : ''}${s.gstin ? '<br>GSTIN: ' + esc(s.gstin) : ''}</div>
      </div>
      <div class="p-meta">
        <div class="p-title">${s.taxEnabled && s.gstin ? 'TAX INVOICE' : 'INVOICE'}</div>
        <div><b>Bill No:</b> ${esc(inv.no)}</div>
        <div><b>Date:</b> ${fmtDate(inv.date)}</div>
      </div>
    </div>
    <div class="p-billto">
      <div class="sm">BILL TO</div>
      <b>${esc(inv.customerName || 'Cash / Walk-in')}</b>
      ${cust && cust.phone ? `<div class="sm">Ph: ${esc(cust.phone)}</div>` : ''}
      ${cust && cust.address ? `<div class="sm">${esc(cust.address)}</div>` : ''}
      ${cust && cust.gstin ? `<div class="sm">GSTIN: ${esc(cust.gstin)}</div>` : ''}
    </div>
    <table class="p-table">
      <thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc</th>${s.taxEnabled ? '<th class="r">GST</th>' : ''}<th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="p-foot">
      <div class="p-left">
        ${s.taxEnabled && (t.taxBreakup || inv.taxBreakup || []).length ? `<table class="p-tax"><thead><tr><th>GST %</th><th class="r">Taxable</th><th class="r">Tax</th></tr></thead>
          <tbody>${(t.taxBreakup || inv.taxBreakup || []).map((x) => `<tr><td>${pct(x.rate)}%</td><td class="r">${money(x.taxable)}</td><td class="r">${money(x.tax)}</td></tr>`).join('')}</tbody></table>` : ''}
        <div class="p-words"><b>Amount in words:</b><br>${esc(amountInWords(inv.total))}</div>
        ${s.terms ? `<div class="sm p-terms">${esc(s.terms)}</div>` : ''}
      </div>
      <div class="p-tots">
        <div><span>Items total</span><b>${money(num(t.gross) || num(inv.total))}</b></div>
        ${num(t.itemDiscount) ? `<div><span>Item discount</span><b>-${money(t.itemDiscount)}</b></div>` : ''}
        ${num(t.billDiscount) ? `<div><span>Bill discount</span><b>-${money(t.billDiscount)}</b></div>` : ''}
        ${s.taxEnabled ? `<div><span>Taxable</span><b>${money(num(t.subtotal) || 0)}</b></div>
          <div><span>GST</span><b>${money(num(t.tax) || num(inv.tax))}</b></div>` : ''}
        ${num(t.roundOff) ? `<div><span>Round off</span><b>${num(t.roundOff) > 0 ? '+' : '-'}${money(Math.abs(num(t.roundOff)), false)}</b></div>` : ''}
        <div class="grand"><span>Grand Total</span><b>${money(inv.total)}</b></div>
        ${num(inv.paidAtSale) ? `<div><span>Paid (${esc(inv.payMode || 'cash')})</span><b>${money(inv.paidAtSale)}</b></div>` : ''}
        ${alloc.due > 0 ? `<div class="due"><span>Balance on this bill</span><b>${money(alloc.due)}</b></div>` : ''}
        ${cust && mode !== 'quote' ? `<div class="sm"><span>Khata balance</span><b>${money(customerBalance(cust, S.invoices, S.payments))}</b></div>` : ''}
      </div>
    </div>
    <div class="p-sign">
      <div class="sm">Received by</div>
      <div class="sign-line"></div>
      <div class="sm">For ${esc(s.shopName || '')}</div>
      <div class="sign-line"></div>
    </div>
    ${inv.createdByName ? `<div class="sm" style="margin-top:6px">Billed by: ${esc(inv.createdByName)}</div>` : ''}
    <div class="p-thanks sm">Thank you for your business!</div>
  </div>`;
}

ACTIONS['print-invoice'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  printHTML(invoiceHTML(inv, 'invoice'), 'Invoice ' + inv.no);
};

function printHTML(inner, title) {
  let host = document.getElementById('print-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'print-root';
    document.body.appendChild(host);
  }
  host.innerHTML = inner;
  const old = document.title;
  document.title = title || 'Print';
  UI.closeModal();
  setTimeout(() => {
    window.print();
    document.title = old;
    setTimeout(() => { host.innerHTML = ''; }, 800);
  }, 120);
}

/* ------------------------------ WhatsApp share ------------------------------ */
function invoiceWAText(inv) {
  const s = S.settings;
  const cust = findCustomer(inv.customerId);
  const alloc = allocatePayments(S.invoices, S.payments).byInvoice[inv.id] || { due: 0 };
  const lines = (inv.lines || []).map((l, i) =>
    `${i + 1}. ${l.name} — ${qtyFmt(l.qty)} ${l.sellUnit === 'box' ? 'box' : l.unit} × ${money(l.rate, false)} = ${money(l.total, false)}`
  ).join('\n');
  const bal = cust ? customerBalance(cust, S.invoices, S.payments) : 0;
  return `*${s.shopName || 'Store'}*${s.phone ? ' · ' + s.phone : ''}
Bill: ${inv.no}   Date: ${fmtDate(inv.date)}
Customer: ${inv.customerName || 'Cash'}

${lines}

Total: ${money(inv.total)}
${num(inv.paidAtSale) ? `Paid: ${money(inv.paidAtSale)}\n` : ''}${alloc.due > 0 ? `*Pending on this bill: ${money(alloc.due)}*\n` : ''}${bal > 0 ? `*Total khata balance: ${money(bal)}*\n` : ''}${s.terms ? '\n' + s.terms : ''}`;
}

ACTIONS['wa-invoice'] = (el) => {
  const inv = findInvoice(el.dataset.id);
  if (!inv) return;
  sendWA(inv.customerId, invoiceWAText(inv), 'bill ' + inv.no, inv.customerName);
};

/**
 * Send any message to a customer on WhatsApp.
 * - desktop  → opens web.whatsapp.com in the logged-in WhatsApp Web tab
 * - phone    → opens the WhatsApp app
 * - no number saved → asks for it once, saves it to the customer, then opens the chat
 */
function sendWA(customerId, text, what, fallbackName) {
  const cust = customerId ? findCustomer(customerId) : null;
  if (cust && cust.phone) {
    const url = waOpen(cust.phone, text);
    UI.toast('Opening WhatsApp for ' + cust.name + (url.includes('web.whatsapp.com') ? ' (WhatsApp Web)' : ''));
    return;
  }
  if (!cust) {
    copyText(text).then((ok) => UI.toast(ok ? 'Cash bill — message copied, paste it in any chat' : 'Could not copy', ok ? 'ok' : 'warn', 5000));
    return;
  }
  waPhoneModal(cust, text, what);
}

function waPhoneModal(cust, text, what) {
  UI.openModal('WhatsApp number', `
    <p class="pad-top">No WhatsApp number saved for <b>${esc(cust.name)}</b>. Type it once — it is saved on the customer for next time.</p>
    <div class="form-grid">
      <label class="fld wide"><span>WhatsApp number</span>
        <input id="wa_phone" value="${esc(cust.phone || '')}" inputmode="tel" placeholder="10-digit mobile"></label>
    </div>
    <p class="note-line">Opens <b>${isMobileDevice() ? 'the WhatsApp app' : 'WhatsApp Web'}</b> with this message already typed in the chat —
      your WhatsApp stays logged in as it is, you only press Send.</p>
    <div class="modal-actions">
      <button class="btn primary" data-act="wa-phone-save" data-id="${cust.id}">${icon('wa')} Save & open WhatsApp</button>
      <button class="btn ghost" data-act="wa-copy-now" data-id="${cust.id}">Just copy the message</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
  S._waPending = { text, what };
}
ACTIONS['wa-phone-save'] = async (el) => {
  const cust = findCustomer(el.dataset.id);
  if (!cust) return;
  const phone = document.getElementById('wa_phone').value.trim();
  if (normPhone(phone, S.settings.countryCode).length < 10) return UI.toast('Enter a valid mobile number', 'warn');
  cust.phone = phone;
  await ACT.save('customers', cust, S, true);
  const pending = S._waPending || {};
  S._waPending = null;
  UI.closeModal();
  render();
  sendWA(cust.id, pending.text || '', pending.what || '');
};
ACTIONS['wa-copy-now'] = async (el) => {
  const pending = S._waPending || {};
  const ok = await copyText(pending.text || '');
  UI.closeModal();
  S._waPending = null;
  UI.toast(ok ? 'Message copied — paste it in the customer chat' : 'Could not copy', ok ? 'ok' : 'warn', 5000);
};

/* Quick test button from Settings */
ACTIONS['wa-test'] = () => {
  const s = S.settings;
  const text = `*${s.shopName}*\nThis is a test message from your billing app.\nIf you can see this draft, sending bills on WhatsApp is working 👍`;
  const my = S.customers.find((c) => c.phone);
  if (my) return sendWA(my.id, text, 'test message');
  copyText(text);
  UI.openModal('WhatsApp test', `
    <p class="pad-top">Save at least one customer with a phone number to test sending. Meanwhile, here is the exact link this device will open:</p>
    <pre class="code">${esc(waUrl('9876543210', text).split('&text=')[0])}</pre>
    <div class="modal-actions"><button class="btn primary" data-act="modal-close">OK</button></div>`);
};

/* ------------------------------ CSV export ------------------------------ */
ACTIONS['export-invoices'] = () => {
  const rows = S.invoices.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const text = csv(rows, [
    { label: 'Bill No', value: 'no' }, { label: 'Date', value: 'date' }, { label: 'Customer', value: 'customerName' },
    { label: 'Items', value: (r) => (r.lines || []).length }, { label: 'Qty', value: (r) => r.totals ? r.totals.qty : '' },
    { label: 'Taxable', value: (r) => (r.totals ? r.totals.subtotal : '') }, { label: 'GST', value: 'tax' },
    { label: 'Total', value: 'total' }, { label: 'Paid at billing', value: 'paidAtSale' },
    { label: 'Pending', value: (r) => round2(num(r.total) - num(r.paidAtSale)) }
  ]);
  download(`bills_${todayISO()}.csv`, text, 'text/csv');
  UI.toast('CSV downloaded');
};
