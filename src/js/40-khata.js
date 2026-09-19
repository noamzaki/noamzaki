/* =========================================================================
   VIEWS — Khata (customer ledgers), payments, reminders, statements
   ========================================================================= */

VIEWS.khata = function () {
  const f = S.filters.khata;
  let list = S.customers.map((c) => {
    const bal = customerBalance(c, S.invoices, S.payments);
    const invs = S.invoices.filter((i) => i.customerId === c.id);
    const alloc = allocatePayments(invs, S.payments);
    const last = invs.slice().sort(sortByDate).slice(-1)[0];
    const oldestDue = Object.keys(alloc.byInvoice).filter((id) => alloc.byInvoice[id].due > 0.004)
      .map((id) => invs.find((i) => i.id === id)).sort(sortByDate)[0];
    return { c, bal, count: invs.length, last, oldestDueDays: oldestDue ? daysBetween(oldestDue.date, todayISO()) : null };
  });
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((x) => (x.c.name + ' ' + (x.c.phone || '') + ' ' + (x.c.area || '')).toLowerCase().includes(q));
  }
  if (f.onlyDue) list = list.filter((x) => x.bal > 0.004 || x.bal < -0.004);
  list.sort((a, b) => b.bal - a.bal);

  const totalDue = round2(list.filter((x) => x.bal > 0).reduce((s, x) => s + x.bal, 0));
  const over30 = list.filter((x) => x.bal > 0.004 && x.oldestDueDays != null && x.oldestDueDays > 30);

  return `<div class="view">
    ${card('', `
      <div class="filters">
        <div class="search-wrap">${icon('search')}<input placeholder="Search customer name, phone, area…" value="${esc(f.q)}" data-input="flt-khata" data-f="q" data-search-focus></div>
        <label class="check"><input type="checkbox" ${f.onlyDue ? 'checked' : ''} data-change="flt-khata" data-f="onlyDue"> Only with balance</label>
        <span class="spacer"></span>
        <button class="btn" data-act="cust-modal">${icon('plus')} New customer</button>
        <button class="btn ghost" data-act="export-khata">${icon('download')} CSV</button>
      </div>
      <div class="stat-line"><span><b>${list.length}</b> customers</span><span>Total receivable <b class="warn-t">${money(totalDue)}</b></span>
        ${over30.length ? `<span><b class="bad-t">${over30.length}</b> overdue 30+ days</span>` : ''}</div>
    `)}

    ${list.length ? card('', `<div class="list">
      ${list.map(({ c, bal, count, last, oldestDueDays }) => `
        <div class="row" data-act="open-customer" data-id="${c.id}">
          <div class="avatar ${bal > 0 ? 'warn' : 'ok'}">${esc(c.name.slice(0, 1).toUpperCase())}</div>
          <div class="row-main">
            <b>${esc(c.name)} ${c.portal ? '<span class="pill ok" title="has app login">app login</span>' : ''}</b>
            <small>${esc(c.phone || 'no phone')} · ${count} bills${last ? ' · last ' + fmtDateShort(last.date) : ''}
            ${oldestDueDays != null && bal > 0 ? ` · oldest due ${oldestDueDays}d` : ''}</small>
          </div>
          <div class="row-right">
            <b class="${bal > 0 ? 'warn-t' : bal < 0 ? 'ok-t' : 'muted'}">${money(Math.abs(bal))}</b><!-- advances shown positive, labelled below -->
            <small>${bal > 0 ? 'to receive' : bal < 0 ? 'advance' : 'settled'}</small>
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-act="pay-modal" data-cust="${c.id}" title="Take payment">${icon('cash')}</button>
            ${bal > 0 ? `<button class="icon-btn" data-act="wa-reminder" data-id="${c.id}" title="Send reminder">${icon('wa')}</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`) : card('', emptyState('No customers yet.', 'Add customer', 'cust-modal', 'user'))}
  </div>`;
};

ACTIONS['flt-khata'] = (el) => {
  S.filters.khata[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  render();
  if (el.dataset.f === 'q') { const i = document.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
};

/* ------------------------- customer detail (khata page) ------------------------- */
ACTIONS['open-customer'] = (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  UI.closeModal();
  const led = buildLedger(c, S.invoices, S.payments);
  const alloc = allocatePayments(S.invoices.filter((i) => i.customerId === c.id), S.payments);
  const openBills = S.invoices.filter((i) => i.customerId === c.id && (alloc.byInvoice[i.id] || {}).due > 0.004);
  const bills = S.invoices.filter((i) => i.customerId === c.id).sort(sortByDate).reverse();
  const pays = S.payments.filter((p) => p.customerId === c.id).sort(sortByDate).reverse();
  const recent = led.rows.slice(-25).reverse();

  UI.openModal('Khata — ' + c.name, `
    <div class="khata-head">
      <div class="kh-bal ${led.balance > 0 ? 'warn' : 'ok'}">
        <small>${led.balance > 0 ? 'You will receive' : led.balance < 0 ? 'Advance with you' : 'Fully settled'}</small>
        <b>${money(Math.abs(led.balance))}</b>
      </div>
      <div class="kh-meta">
        <div><small>Phone</small><b>${esc(c.phone || '—')}</b></div>
        <div><small>Area</small><b>${esc(c.area || '—')}</b></div>
        <div><small>Total billed</small><b>${money(led.debit)}</b></div>
        <div><small>Total received</small><b>${money(led.credit)}</b></div>
      </div>
      <div class="modal-actions sticky-top">
        <button class="btn primary" data-act="pay-modal" data-cust="${c.id}">${icon('cash')} Record payment</button>
        <button class="btn ghost" data-act="bill-for-customer" data-id="${c.id}">${icon('bill')} New bill</button>
        <button class="btn ghost" data-act="wa-reminder" data-id="${c.id}">${icon('wa')} Payment reminder</button>
        <button class="btn ghost" data-act="wa-statement" data-id="${c.id}">${icon('wa')} Send khata statement</button>
        <button class="btn ghost" data-act="print-statement" data-id="${c.id}">${icon('print')} Statement</button>
        <button class="btn ghost" data-act="cust-modal" data-id="${c.id}">${icon('edit')} Edit</button>
      </div>
    </div>

    ${openBills.length ? `<h4 class="sec-title">Pending bills (${openBills.length})</h4>
      <div class="list tight">${openBills.map((i) => {
        const a = alloc.byInvoice[i.id];
        return `<div class="row" data-act="view-invoice" data-id="${i.id}">
          <div class="row-main"><b>${esc(i.no)}</b><small>${fmtDate(i.date)} · ${a.ageDays} days old</small></div>
          <div class="row-right"><b class="warn-t">${money(a.due)}</b><small>of ${money(i.total)}</small></div>
          <button class="icon-btn" data-act="wa-invoice" data-id="${i.id}" title="Send this bill on WhatsApp">${icon('wa')}</button>
          <button class="icon-btn" data-act="pay-modal" data-cust="${c.id}" data-inv="${i.id}" title="Take payment">${icon('cash')}</button>
        </div>`;
      }).join('')}</div>` : `<div class="pad muted">No pending bills — khata is clear.</div>`}

    <h4 class="sec-title">Ledger (latest 25 entries)</h4>
    <div class="table-wrap"><table class="mini-table">
      <thead><tr><th>Date</th><th>Details</th><th class="r">Bill ${CUR}</th><th class="r">Paid ${CUR}</th><th class="r">Balance</th></tr></thead>
      <tbody>${recent.map((r) => `<tr class="lr ${r.type}">
        <td>${fmtDateShort(r.date)}</td>
        <td>${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td>
        <td class="r">${r.debit ? money(r.debit, false) : ''}</td>
        <td class="r ok-t">${r.credit ? money(r.credit, false) : ''}</td>
        <td class="r b">${money(r.balance, false)}</td></tr>`).join('')}
        ${led.rows.length > recent.length ? `<tr><td colspan="5" class="muted center">… ${led.rows.length - recent.length} older entries in the printed statement</td></tr>` : ''}
      </tbody>
    </table></div>

    ${bills.length ? `<h4 class="sec-title">All bills (${bills.length})</h4>
      <div class="list tight">${bills.slice(0, 10).map((i) => `<div class="row" data-act="view-invoice" data-id="${i.id}">
        <div class="row-main"><b>${esc(i.no)}</b><small>${fmtDate(i.date)} · ${(i.lines || []).length} items</small></div>
        <div class="row-right"><b>${money(i.total)}</b><small>${num(i.paidAtSale) ? 'paid ' + money(i.paidAtSale) : 'credit'}</small></div>
      </div>`).join('')}</div>` : ''}

    ${pays.length ? `<h4 class="sec-title">Payments received (${pays.length})</h4>
      <div class="list tight">${pays.slice(0, 10).map((p) => `<div class="row">
        <div class="row-main"><b>${money(p.amount)}</b><small>${fmtDate(p.date)} · ${esc(p.mode || 'Cash')}${p.note ? ' · ' + esc(p.note) : ''}</small></div>
        <button class="icon-btn danger" data-act="del-payment" data-id="${p.id}">${icon('trash')}</button>
      </div>`).join('')}</div>` : ''}
  `, { wide: true });
};

ACTIONS['bill-for-customer'] = (el) => {
  UI.closeModal();
  S.bill = blankBill();
  S.bill.customerId = el.dataset.id;
  S.tab = 'bill';
  render();
};

/* ------------------------- add / edit customer ------------------------- */
function customerModal(id, onDone) {
  const c = id ? findCustomer(id) : null;
  UI.openModal(c ? 'Edit customer' : 'New customer', `
    <div class="form-grid">
      <label class="fld wide"><span>Name *</span><input id="cm_name" value="${esc(c ? c.name : '')}" placeholder="Shop / person name"></label>
      <label class="fld"><span>Phone (WhatsApp)</span><input id="cm_phone" value="${esc(c ? c.phone : '')}" placeholder="10 digit mobile"></label>
      <label class="fld"><span>Area / route</span><input id="cm_area" value="${esc(c ? c.area : '')}" placeholder="e.g. Market Road"></label>
      <label class="fld wide"><span>Address</span><input id="cm_addr" value="${esc(c ? c.address : '')}"></label>
      <label class="fld"><span>GSTIN (optional)</span><input id="cm_gst" value="${esc(c ? c.gstin : '')}"></label>
      <label class="fld"><span>Old / opening balance ${CUR}</span><input id="cm_open" type="number" step="any" value="${c ? num(c.openingBalance) || '' : ''}" placeholder="0 (they owe you)"></label>
      <label class="fld wide"><span>Note</span><input id="cm_note" value="${esc(c ? c.note : '')}"></label>
    </div>
    <p class="note-line">Opening balance = old dues you are carrying in the notebook. Enter a negative number if you owe them.</p>
    ${c ? portalCredsSection(c) : `<p class="note-line">Save the customer first, then you can create their app login in the same window.</p>`}
    <div class="modal-actions">
      <button class="btn primary" data-act="cust-save" data-id="${c ? c.id : ''}">${icon('check')} Save</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
}
ACTIONS['cust-modal'] = (el) => {
  const id = el.dataset && el.dataset.id;
  customerModal(id || null, () => render());
};
ACTIONS['cust-save'] = async (el) => {
  if (!can('khata') && !can('bill')) return UI.toast('You do not have permission to add customers on this login', 'warn', 6000);
  const id = el.dataset.id || '';
  const name = document.getElementById('cm_name').value.trim();
  if (!name) return UI.toast('Customer name is required', 'warn');
  const existing = id ? findCustomer(id) : null;
  const obj = {
    id: existing ? existing.id : uid('cust'),
    name,
    phone: document.getElementById('cm_phone').value.trim(),
    area: document.getElementById('cm_area').value.trim(),
    address: document.getElementById('cm_addr').value.trim(),
    gstin: document.getElementById('cm_gst').value.trim(),
    openingBalance: num(document.getElementById('cm_open').value),
    openingDate: (existing && existing.openingDate) || todayISO(),
    note: document.getElementById('cm_note').value.trim(),
    createdAt: existing ? existing.createdAt : new Date().toISOString()
  };
  await ACT.save('customers', obj, S, true);
  UI.toast((existing ? 'Customer updated' : 'Customer added') + ': ' + name);
  if (S.tab === 'bill' && !existing) { S.bill.customerId = obj.id; }
  customerModal(obj.id, () => render());      // reopen so the owner can create the app login
};

ACTIONS['del-customer'] = async (el) => {
  if (!requirePerm('khata', 'delete customers')) return;
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  const bills = S.invoices.filter((i) => i.customerId === c.id).length;
  const bal = customerBalance(c, S.invoices, S.payments);
  if (!confirm(`Delete customer ${c.name}?\n\nBills: ${bills}\nBalance: ${money(bal)}\n\nTheir bills and payments will stay in records but will no longer be linked to a khata.`)) return;
  await ACT.remove('customers', c.id, S, true);
  UI.closeModal();
  render();
  UI.toast('Customer deleted');
};

/* ------------------------- payments ------------------------- */
function nextCustFrom() { return S.customers.slice().sort((a, b) => a.name.localeCompare(b.name)); }

function payModal(preset = {}) {
  const custId = preset.customerId || '';
  const c = custId ? findCustomer(custId) : null;
  const alloc = c ? allocatePayments(S.invoices.filter((i) => i.customerId === c.id), S.payments) : null;
  const openBills = c ? S.invoices.filter((i) => i.customerId === c.id && (alloc.byInvoice[i.id] || {}).due > 0.004).sort(sortByDate) : [];
  const bal = c ? customerBalance(c, S.invoices, S.payments) : 0;
  UI.openModal('Record payment' + (c ? ' — ' + c.name : ''), `
    <div class="form-grid">
      <label class="fld wide"><span>Customer *</span>
        <select id="pm_cust">${customerOptions(custId)}</select></label>
      <label class="fld" id="pm_bal_wrap" ${c ? '' : 'hidden'}>
        <span>Current balance</span><input value="${c ? money(bal, false) : ''}" id="pm_bal" readonly></label>
      <label class="fld"><span>Amount ${CUR} *</span>
        <input id="pm_amt" type="number" step="any" min="0" inputmode="decimal" value="${preset.amount != null ? preset.amount : ''}" placeholder="0">
      </label>
      <label class="fld"><span>Date</span><input id="pm_date" type="date" value="${preset.date || todayISO()}"></label>
      <label class="fld"><span>Mode</span>
        <select id="pm_mode">${(S.settings.paymentModes || ['Cash', 'UPI', 'Bank', 'Cheque']).map((m) => `<option ${m === 'Cash' ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <label class="fld"><span>Apply to bill (optional)</span>
        <select id="pm_inv">
          <option value="">Auto — clear oldest bill first</option>
          ${openBills.map((i) => `<option value="${i.id}" ${preset.invoiceId === i.id ? 'selected' : ''}>${esc(i.no)} · ${fmtDateShort(i.date)} · pending ${money(alloc.byInvoice[i.id].due, false)}</option>`).join('')}
        </select></label>
      <label class="fld wide"><span>Note / reference (UPI ref, cheque no.)</span><input id="pm_note" value="${esc(preset.note || '')}"></label>
    </div>
    ${bal > 0 && fixedPayBtn(bal) ? '' : ''}
    <div id="pm_quick" class="quick-amts">${bal > 0 ? `<button class="chip" data-act="pay-set-amt" data-v="${bal}">Full ${money(bal)}</button>` : ''}
      <button class="chip" data-act="pay-set-amt" data-v="500">${money(500)}</button>
      <button class="chip" data-act="pay-set-amt" data-v="1000">${money(1000)}</button>
      <button class="chip" data-act="pay-set-amt" data-v="2000">${money(2000)}</button></div>
    <div class="modal-actions">
      <button class="btn primary" data-act="pay-save">${icon('check')} Save payment</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
  const sel = document.getElementById('pm_cust');
  if (sel) sel.onchange = () => {
    const id = sel.value;
    render();
    payModalRefresh(id);
  };
}
function fixedPayBtn() { return false; }
function payModalRefresh(custId) {
  // re-open modal with the newly picked customer so open bills + balance update
  UI.closeModal();
  if (!custId) { payModal({}); return; }
  const amt = num((document.getElementById('pm_amt') || {}).value);
  payModal({ customerId: custId, amount: amt || null });
}
ACTIONS['pay-modal'] = (el) => payModal({
  customerId: (el.dataset && el.dataset.cust) || S.open.customerId || '',
  invoiceId: (el.dataset && el.dataset.inv) || '',
  amount: el.dataset && el.dataset.amount ? num(el.dataset.amount) : null
});
ACTIONS['pay-set-amt'] = (el) => { const i = document.getElementById('pm_amt'); if (i) i.value = el.dataset.v; };

ACTIONS['pay-save'] = async () => {
  if (!requirePerm('payment', 'record payments')) return;
  const custEl = document.getElementById('pm_cust');
  const amtEl = document.getElementById('pm_amt');
  if (!custEl || !amtEl) return;               // the form was closed before the tap landed
  const custId = custEl.value;
  const amount = num(amtEl.value);
  if (!custId) return UI.toast('Choose a customer (use "Cash / Walk-in" only for cash sales)', 'warn');
  if (amount <= 0) return UI.toast('Enter the amount received', 'warn');
  const c = findCustomer(custId);
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const pay = {
    id: uid('pay'), customerId: custId, customerName: c ? c.name : '',
    amount: round2(amount), date: val('pm_date') || todayISO(),
    mode: val('pm_mode') || 'Cash', invoiceId: val('pm_inv'),
    note: val('pm_note').trim(), createdBy: (DB.user && DB.user.email) || 'local'
  };
  await ACT.savePayment(pay, S);
  UI.closeModal();
  render();
  const alloc = allocatePayments(S.invoices.filter((i) => i.customerId === custId), S.payments);
  UI.openModal('Payment saved ✓', `<div class="saved">
      <div class="saved-big">${money(pay.amount)}</div>
      <div class="muted">${esc(c.name)} · ${fmtDate(pay.date)} · ${esc(pay.mode)}</div>
      <div class="pill ${alloc.totalDue > 0 ? 'warn' : 'ok'}" style="margin-top:8px">${alloc.totalDue > 0 ? 'Remaining khata: ' + money(alloc.totalDue) : 'Khata fully settled'}</div>
      <div class="saved-actions">
        <button class="btn primary" data-act="print-receipt" data-id="${pay.id}">${icon('print')} Print receipt</button>
        <button class="btn ghost" data-act="wa-payment" data-id="${pay.id}">${icon('wa')} Send confirmation</button>
        <button class="btn ghost" data-act="modal-close">Done</button>
      </div></div>`);
  S.open.customerId = custId;
};

ACTIONS['del-payment'] = async (el) => {
  if (!requirePerm('deletePayment', 'delete payments')) return;
  const p = S.payments.find((x) => x.id === el.dataset.id);
  if (!p) return;
  if (!confirm(`Delete payment of ${money(p.amount)} from ${p.customerName || 'customer'} dated ${fmtDate(p.date)}?`)) return;
  await ACT.remove('payments', p.id, S, true);
  UI.toast('Payment deleted — balance restored');
  if (S.open.customerId) ACTIONS['open-customer']({ dataset: { id: p.customerId } });
  else render();
};

ACTIONS['print-receipt'] = (el) => {
  const p = S.payments.find((x) => x.id === el.dataset.id);
  if (!p) return;
  const c = findCustomer(p.customerId);
  const s = S.settings;
  const bal = c ? customerBalance(c, S.invoices, S.payments) : 0;
  printHTML(`<div class="print-sheet receipt">
    <div class="p-head"><div class="p-shop"><h2>${esc(s.shopName)}</h2>
      <div class="sm">${esc(s.address || '')}${s.phone ? '<br>Ph: ' + esc(s.phone) : ''}</div></div>
      <div class="p-meta"><div class="p-title">RECEIPT</div><div><b>Date:</b> ${fmtDate(p.date)}</div></div></div>
    <div class="p-billto"><div class="sm">RECEIVED WITH THANKS FROM</div><b>${esc(p.customerName || '')}</b>
      ${c && c.phone ? `<div class="sm">Ph: ${esc(c.phone)}</div>` : ''}</div>
    <table class="p-table"><tbody>
      <tr><td>Amount received</td><td class="r b">${money(p.amount)}</td></tr>
      <tr><td>Mode</td><td class="r">${esc(p.mode || 'Cash')}</td></tr>
      ${p.note ? `<tr><td>Reference</td><td class="r">${esc(p.note)}</td></tr>` : ''}
      <tr><td>Khata balance after this payment</td><td class="r b">${money(bal)}</td></tr>
    </tbody></table>
    <div class="p-words"><b>In words:</b> ${esc(amountInWords(p.amount))}</div>
    <div class="p-sign"><div class="sign-line"></div><div class="sm">Authorised signatory</div></div>
  </div>`, 'Receipt');
};

ACTIONS['wa-payment'] = (el) => {
  const p = S.payments.find((x) => x.id === el.dataset.id);
  if (!p) return;
  const c = findCustomer(p.customerId);
  const bal = c ? customerBalance(c, S.invoices, S.payments) : 0;
  const text = `*${S.settings.shopName}*
Payment received: ${money(p.amount)}
Date: ${fmtDate(p.date)}   Mode: ${p.mode || 'Cash'}
${bal > 0 ? `Remaining khata balance: ${money(bal)}` : 'Your khata is fully settled. Thank you!'}`;
  sendWA(p.customerId, text, 'receipt');
};

/* ------------------------- reminders + statement ------------------------- */
/** Reminder text: pending bills with dates + total */
function reminderWAText(c) {
  const bal = customerBalance(c, S.invoices, S.payments);
  const invs = S.invoices.filter((i) => i.customerId === c.id);
  const alloc = allocatePayments(invs, S.payments);
  const open = invs.filter((i) => (alloc.byInvoice[i.id] || {}).due > 0.004).sort(sortByDate);
  const body = open.map((i) => `• ${fmtDateShort(i.date)} — ${esc(i.no)} — pending ${money(alloc.byInvoice[i.id].due)}`).join('\n');
  return `Namaste ${c.name} 🙏
*${S.settings.shopName}*
Your pending khata balance is *${money(bal)}*.

${body}

Kindly pay at your convenience. Thank you!
${S.settings.phone ? 'Ph: ' + S.settings.phone : ''}`;
}

/** Full khata statement as WhatsApp text (all bills + payments + closing balance) */
function statementWAText(c) {
  const led = buildLedger(c, S.invoices, S.payments);
  const rows = led.rows.slice(-20).map((r) =>
    `${fmtDateShort(r.date)}  ${r.label}${r.sub ? ' (' + r.sub + ')' : ''}\n            Bill ${money(r.debit, false)}  ·  Paid ${money(r.credit, false)}  ·  Bal ${money(r.balance, false)}`);
  return `*${S.settings.shopName}*${S.settings.phone ? ' · ' + S.settings.phone : ''}
Khata statement — ${c.name}${led.rows.length > 20 ? `\n(latest 20 of ${led.rows.length} entries)` : ''}

${rows.join('\n')}

Total billed: ${money(led.debit)}
Total paid: ${money(led.credit)}
*Closing balance: ${money(led.balance)}*${led.balance > 0 ? ' (to be received)' : led.balance < 0 ? ' (advance with you)' : ''}

Thank you for your business 🙏`;
}

ACTIONS['wa-reminder'] = (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  sendWA(c.id, reminderWAText(c), 'reminder');
};

ACTIONS['wa-statement'] = (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  sendWA(c.id, statementWAText(c), 'khata statement');
};

ACTIONS['print-statement'] = (el) => {
  const c = findCustomer(el.dataset.id);
  if (!c) return;
  const led = buildLedger(c, S.invoices, S.payments);
  const s = S.settings;
  printHTML(`<div class="print-sheet">
    <div class="p-head"><div class="p-shop"><h2>${esc(s.shopName)}</h2>
      <div class="sm">${esc(s.address || '')}${s.phone ? '<br>Ph: ' + esc(s.phone) : ''}</div></div>
      <div class="p-meta"><div class="p-title">KHATA STATEMENT</div><div><b>Date:</b> ${fmtDate(todayISO())}</div></div></div>
    <div class="p-billto"><div class="sm">ACCOUNT OF</div><b>${esc(c.name)}</b>${c.phone ? `<div class="sm">Ph: ${esc(c.phone)}</div>` : ''}${c.area ? `<div class="sm">${esc(c.area)}</div>` : ''}</div>
    <table class="p-table"><thead><tr><th>Date</th><th>Particulars</th><th class="r">Bill ${CUR}</th><th class="r">Paid ${CUR}</th><th class="r">Balance ${CUR}</th></tr></thead>
      <tbody>${led.rows.map((r) => `<tr><td>${fmtDateShort(r.date)}</td><td>${esc(r.label)}${r.sub ? ' — ' + esc(r.sub) : ''}</td>
        <td class="r">${r.debit ? money(r.debit, false) : ''}</td><td class="r">${r.credit ? money(r.credit, false) : ''}</td>
        <td class="r b">${money(r.balance, false)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2" class="b">TOTAL</td><td class="r b">${money(led.debit, false)}</td><td class="r b">${money(led.credit, false)}</td>
        <td class="r b">${money(led.balance, false)}</td></tr></tfoot></table>
    <div class="p-words"><b>Closing balance:</b> ${money(led.balance)} ${led.balance > 0 ? '(to be received)' : led.balance < 0 ? '(advance with you)' : ''}</div>
    <div class="p-sign"><div class="sign-line"></div><div class="sm">For ${esc(s.shopName)}</div></div>
  </div>`, 'Khata statement');
};

ACTIONS['export-khata'] = () => {
  const rows = S.customers.map((c) => ({
    name: c.name, phone: c.phone || '', area: c.area || '',
    bills: S.invoices.filter((i) => i.customerId === c.id).length,
    billed: round2(S.invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + num(i.total), 0)),
    received: round2(S.payments.filter((p) => p.customerId === c.id).reduce((s, p) => s + num(p.amount), 0)),
    balance: customerBalance(c, S.invoices, S.payments)
  })).sort((a, b) => b.balance - a.balance);
  download(`khata_${todayISO()}.csv`, csv(rows, [
    { label: 'Customer', value: 'name' }, { label: 'Phone', value: 'phone' }, { label: 'Area', value: 'area' },
    { label: 'Bills', value: 'bills' }, { label: 'Total billed', value: 'billed' },
    { label: 'Total received', value: 'received' }, { label: 'Balance', value: 'balance' }
  ]), 'text/csv');
  UI.toast('Khata CSV downloaded');
};

/* ------------------------- Payments list view ------------------------- */
VIEWS.payments = function () {
  const f = S.filters.pay;
  const from = f.from || addDaysISO(todayISO(), -29);
  const to = f.to || todayISO();
  const list = S.payments.filter((p) => inRange(p.date, from, to)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = round2(list.reduce((s, p) => s + num(p.amount), 0));
  const byMode = {};
  list.forEach((p) => { byMode[p.mode || 'Cash'] = round2(num(byMode[p.mode || 'Cash']) + num(p.amount)); });
  const dayTotals = {};
  list.forEach((p) => { dayTotals[p.date] = round2(num(dayTotals[p.date]) + num(p.amount)); });
  const atBilling = round2(S.invoices.filter((i) => inRange(i.date, from, to)).reduce((s, i) => s + num(i.paidAtSale), 0));
  const pendingAll = receivableTotal();

  return `<div class="view">
    ${card('', `
      <div class="filters">
        <button class="btn primary" data-act="pay-modal">${icon('cash')} Record payment</button>
        <button class="btn ghost" data-act="print-day-close">${icon('print')} Day-close summary</button>
        <label class="fld sm"><span>From</span><input type="date" value="${from}" data-input="flt-pay" data-f="from"></label>
        <label class="fld sm"><span>To</span><input type="date" value="${to}" data-input="flt-pay" data-f="to"></label>
        <button class="btn ghost sm" data-act="export-payments">${icon('download')} CSV</button>
      </div>
    `)}
    <div class="grid kpis">
      ${can('reports') ? kpi('Khata payments in period', money(total), `${list.length} entries`) : kpi('Payments recorded', String(list.length), 'in this period')}
      ${can('reports') ? kpi('Collected at billing', money(atBilling), 'cash/UPI taken while billing', 'ok') : ''}
      ${can('reports') ? kpi('Total received', money(total + atBilling), 'khata + billing') : ''}
      ${can('khata') ? kpi('Still pending (all)', money(pendingAll), 'across all customers', pendingAll > 0 ? 'warn' : 'ok') : ''}
    </div>
    ${card('By payment mode', `<div class="mini-stats">${Object.keys(byMode).map((m) => `<div><small>${esc(m)}</small><b>${money(byMode[m])}</b></div>`).join('') || '<div class="muted">No payments in this period</div>'}</div>`)}

    ${list.length ? card('Payments received', `<div class="list">${list.map((p) => `
      <div class="row">
        <div class="row-main"><b>${esc(p.customerName || '—')}</b>
          <small>${fmtDate(p.date)} · ${esc(p.mode || 'Cash')}${p.note ? ' · ' + esc(p.note) : ''}${p.invoiceId ? ' · against bill' : ''}</small></div>
        <div class="row-right"><b class="ok-t">${money(p.amount)}</b><small>day total ${money(dayTotals[p.date], false)}</small></div>
        <div class="row-actions">
          <button class="icon-btn" data-act="print-receipt" data-id="${p.id}" title="Receipt">${icon('print')}</button>
          <button class="icon-btn" data-act="wa-payment" data-id="${p.id}" title="Send payment confirmation on WhatsApp">${icon('wa')}</button>
          ${can('deletePayment') ? `<button class="icon-btn danger" data-act="del-payment" data-id="${p.id}" title="Delete">${icon('trash')}</button>` : ''}
        </div>
      </div>`).join('')}</div>`) : card('', emptyState('No payments in this period.', 'Record payment', 'pay-modal', 'cash'))}
  </div>`;
};

ACTIONS['flt-pay'] = (el) => { S.filters.pay[el.dataset.f] = el.value; render(); };
ACTIONS['export-payments'] = () => {
  const list = S.payments.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  download(`payments_${todayISO()}.csv`, csv(list, [
    { label: 'Date', value: 'date' }, { label: 'Customer', value: 'customerName' }, { label: 'Amount', value: 'amount' },
    { label: 'Mode', value: 'mode' }, { label: 'Against bill', value: 'invoiceId' }, { label: 'Note', value: 'note' }
  ]), 'text/csv');
  UI.toast('Payments CSV downloaded');
};

/* Night-time day close: sales, cash collected, udhaar given */
ACTIONS['print-day-close'] = (el) => {
  const date = (el.dataset && el.dataset.date) || todayISO();
  const invs = S.invoices.filter((i) => i.date === date);
  const pays = S.payments.filter((p) => p.date === date);
  const sales = round2(invs.reduce((s, i) => s + num(i.total), 0));
  const atBilling = round2(invs.reduce((s, i) => s + num(i.paidAtSale), 0));
  const khata = round2(pays.reduce((s, p) => s + num(p.amount), 0));
  const byMode = {};
  pays.forEach((p) => { byMode[p.mode || 'Cash'] = round2(num(byMode[p.mode || 'Cash']) + num(p.amount)); });
  invs.forEach((i) => { if (num(i.paidAtSale) > 0) byMode[i.payMode || 'Cash'] = round2(num(byMode[i.payMode || 'Cash']) + num(i.paidAtSale)); });
  const totalCash = round2(atBilling + khata);
  const credit = round2(sales - atBilling);
  const damaged = (S.moves || []).filter((m) => m.date === date && m.type === 'adjust' && num(m.qty) < 0);
  const lowNow = S.products.filter(isLowStock);

  printHTML(`<div class="print-sheet">
    <div class="p-head"><div class="p-shop"><h2>${esc(S.settings.shopName)}</h2>
      <div class="sm">Day closing summary</div></div>
      <div class="p-meta"><div class="p-title">DAY CLOSE</div><div><b>Date:</b> ${fmtDate(date)}</div>
      <div class="sm">Printed: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></div></div>

    <table class="p-table"><tbody>
      <tr><td>Bills made</td><td class="r b">${invs.length}</td></tr>
      <tr><td>Total sales (with GST)</td><td class="r b">${money(sales)}</td></tr>
      <tr><td>Cash / UPI received at billing</td><td class="r b">${money(atBilling)}</td></tr>
      <tr><td>Khata payments received in the evening</td><td class="r b">${money(khata)}</td></tr>
      <tr><td><b>TOTAL COLLECTION FOR THE DAY</b></td><td class="r b">${money(totalCash)}</td></tr>
      <tr><td>New udhaar (credit) given today</td><td class="r b">${money(credit)}</td></tr>
      <tr><td>Total pending from all customers</td><td class="r b">${money(receivableTotal())}</td></tr>
    </tbody></table>

    <h4>Collection by mode</h4>
    <table class="p-table"><tbody>${Object.keys(byMode).map((m) => `<tr><td>${esc(m)}</td><td class="r b">${money(byMode[m])}</td></tr>`).join('') || '<tr><td class="sm">No collection</td><td></td></tr>'}</tbody></table>

    <h4>Payments received</h4>
    <table class="p-table"><thead><tr><th>Customer</th><th>Mode</th><th class="r">Amount</th></tr></thead>
      <tbody>${pays.map((p) => `<tr><td>${esc(p.customerName)}</td><td>${esc(p.mode || 'Cash')}</td><td class="r">${money(p.amount, false)}</td></tr>`).join('') || '<tr><td colspan="3" class="sm">No khata payments today</td></tr>'}</tbody></table>

    <h4>Bills of the day</h4>
    <table class="p-table"><thead><tr><th>Bill</th><th>Customer</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Pending</th></tr></thead>
      <tbody>${invs.map((i) => `<tr><td>${esc(i.no)}</td><td>${esc(i.customerName)}</td><td class="r">${money(i.total, false)}</td>
        <td class="r">${money(i.paidAtSale, false)}</td><td class="r">${money(num(i.total) - num(i.paidAtSale), false)}</td></tr>`).join('') || '<tr><td colspan="5" class="sm">No bills</td></tr>'}</tbody></table>

    ${damaged.length ? `<h4>Stock written off / adjusted</h4><table class="p-table"><tbody>
      ${damaged.map((m) => `<tr><td>${esc(m.productName)}</td><td class="r">${qtyFmt(m.qty)} ${esc(m.unit)}</td><td class="r">${esc(m.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}

    ${lowNow.length ? `<h4>Items to reorder (low stock)</h4><table class="p-table"><tbody>
      ${lowNow.map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${qtyFmt(p.stock)} ${esc(p.unit)} left</td><td class="r">alert ${qtyFmt(p.lowStock)}</td></tr>`).join('')}</tbody></table>` : ''}

    <div class="p-sign"><div class="sign-line"></div><div class="sm">Owner's signature</div></div>
  </div>`, 'Day close');
};
