/* =========================================================================
   VIEWS — Stock / Products: automatic stock management, stock-in, adjustments
   ========================================================================= */

VIEWS.products = function () {
  const showCost = can('cost');     // purchase cost, stock value and margin are owner-only
  const mayStock = can('stock');    // adding / editing items and stock movements
  const f = S.filters.prod;
  let list = S.products.slice();
  if (f.q) {
    const words = f.q.toLowerCase().split(/\s+/);
    list = list.filter((p) => words.every((w) => (p.name + ' ' + (p.code || '') + ' ' + (p.brand || '') + ' ' + (p.category || '')).toLowerCase().includes(w)));
  }
  if (f.low) list = list.filter(isLowStock);
  if (f.cat) list = list.filter((p) => (p.category || '') === f.cat);
  list.sort((a, b) => (isLowStock(b) - isLowStock(a)) || String(a.name).localeCompare(String(b.name)));

  const cats = Array.from(new Set(S.products.map((p) => p.category).filter(Boolean))).sort();
  const sv = stockValue(S.products);
  const low = S.products.filter(isLowStock);
  const out = S.products.filter((p) => num(p.stock) <= 0);
  const sameDay = S.moves.filter((m) => m.date === todayISO());

  return `<div class="view">
    ${card('', `
      <div class="filters">
        <div class="search-wrap">${icon('search')}<input placeholder="Search item, code, brand…" value="${esc(f.q)}" data-input="flt-prod" data-f="q" data-search-focus></div>
        <label class="fld sm"><span>Category</span><select data-change="flt-prod" data-f="cat">
          <option value="">All</option>${cats.map((c) => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" ${f.low ? 'checked' : ''} data-change="flt-prod" data-f="low"> Low stock only</label>
        <span class="spacer"></span>
        ${mayStock ? `<button class="btn" data-act="prod-modal">${icon('plus')} New item</button>
        <button class="btn ghost" data-act="stock-in-modal">${icon('pkg')} Stock in</button>` : ''}
        <button class="btn ghost" data-act="export-products">${icon('download')} CSV</button>
        ${mayStock ? `<button class="btn ghost" data-act="recalc-stock" title="Rebuild stock from movement history">Recalculate</button>` : ''}
      </div>
    `)}
    <div class="grid kpis">
      ${kpi('Items', String(S.products.length), `${cats.length} categories`)}
      ${showCost
        ? kpi('Stock value (at cost)', money(sv), 'how much money sits on the shelf')
        : kpi('Units on shelf', qtyFmt(round2(S.products.reduce((t, p) => t + num(p.stock), 0))), 'all items added up')}
      ${kpi('Low stock', String(low.length), 'need reorder', low.length ? 'warn' : 'ok', 'flt-prod-low')}
      ${kpi('Out of stock', String(out.length), out.length ? 'order today' : 'all good', out.length ? 'bad' : 'ok')}
    </div>

    ${todayStockStrip(sameDay)}

    ${list.length ? card('', `<div class="list prod-list">${list.map((p) => {
      const margin = num(p.price) ? round2(((num(p.price) - num(p.cost)) / num(p.price)) * 100) : 0;
      return `<div class="row" data-act="open-product" data-id="${p.id}">
        <div class="row-main">
          <b>${esc(p.name)} ${isLowStock(p) ? '<span class="pill bad">low</span>' : ''}${num(p.stock) <= 0 ? '<span class="pill bad">out</span>' : ''}</b>
          <small>${p.code ? esc(p.code) + ' · ' : ''}${esc(p.category || '')}${p.brand ? ' · ' + esc(p.brand) : ''}${num(p.ppb) > 1 ? ` · 1 box = ${qtyFmt(p.ppb)} ${esc(p.unit)}` : ''}</small>
        </div>
        <div class="row-right">
          <b class="${isLowStock(p) ? 'bad-t' : ''}">${packDisplay(p.stock, p.ppb, p.unit)}</b>
          <small>sell ${money(p.price)} / ${esc(p.unit)}${num(p.ppb) > 1 ? ` · box ${money(round2(num(p.price) * num(p.ppb)))}` : ''}</small>
        </div>
        ${showCost ? `<div class="row-right hide-sm">
          <b>${money(num(p.stock) * num(p.cost))}</b><small>stock value${margin ? ` · ${pct(round2(margin))}% margin` : ''}</small>
        </div>` : ''}
        <div class="row-actions">
          ${mayStock ? `<button class="icon-btn" data-act="stock-in-modal" data-id="${p.id}" title="Stock in">${icon('pkg')}</button>
          <button class="icon-btn" data-act="adjust-modal" data-id="${p.id}" title="Adjust / damage">${icon('settings2')}</button>` : ''}
          <button class="icon-btn" data-act="prod-history" data-id="${p.id}" title="History">${icon('clock')}</button>
          ${mayStock ? `<button class="icon-btn" data-act="prod-modal" data-id="${p.id}" title="Edit">${icon('edit')}</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`) : card('', emptyState('No items found.', mayStock ? 'Add your first item' : '', mayStock ? 'prod-modal' : '', 'box'))}

    ${card('Recent stock movements', (S.moves || []).length ? `<div class="table-wrap"><table class="mini-table">
      <thead><tr><th>Date</th><th>Item</th><th class="r">Qty</th><th>Reason</th><th>Reference</th></tr></thead>
      <tbody>${S.moves.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt).localeCompare(String(a.createdAt)))).slice(0, 25).map((m) => `
        <tr><td>${fmtDateShort(m.date)}</td><td>${esc(m.productName)}${m.note ? `<small>${esc(m.note)}</small>` : ''}</td>
        <td class="r ${num(m.qty) >= 0 ? 'ok-t' : 'bad-t'}">${num(m.qty) > 0 ? '+' : ''}${qtyFmt(m.qty)} ${esc(m.unit || '')}</td>
        <td>${esc(typeLabel(m.type))}</td><td>${esc(m.refLabel || '')}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="pad muted">No movements yet. Stock in / billing will be logged here automatically.</div>`,
      `<button class="btn ghost sm" data-act="export-moves">${icon('download')} Export log</button>`)}
  </div>`;
};

function todayStockStrip(moves) {
  if (!moves.length) return '';
  const inQ = round2(moves.filter((m) => num(m.qty) > 0).reduce((s, m) => s + num(m.qty), 0));
  const outQ = round2(moves.filter((m) => num(m.qty) < 0).reduce((s, m) => s + num(m.qty), 0));
  return card('Today', `<div class="mini-stats">
      <div><small>Received</small><b class="ok-t">+${qtyFmt(inQ)}</b></div>
      <div><small>Sold / used</small><b class="bad-t">${qtyFmt(outQ)}</b></div>
      <div><small>Movements</small><b>${moves.length}</b></div>
    </div>`);
}

ACTIONS['flt-prod'] = (el) => {
  S.filters.prod[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  render();
  if (el.dataset.f === 'q') { const i = document.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
};
ACTIONS['flt-prod-low'] = () => { S.filters.prod.low = true; render(); };

/* ------------------------- product modal ------------------------- */
function productModal(id, onDone) {
  const p = id ? findProduct(id) : null;
  UI.openModal(p ? 'Edit item' : 'New item', `
    <div class="form-grid">
      <label class="fld wide"><span>Item name *</span><input id="p_name" value="${esc(p ? p.name : '')}" placeholder="e.g. Sugar S-30"></label>
      <label class="fld"><span>Item code / SKU</span><input id="p_code" value="${esc(p ? p.code : '')}" placeholder="SUG30"></label>
      <label class="fld"><span>Brand</span><input id="p_brand" value="${esc(p ? p.brand : '')}"></label>
      <label class="fld"><span>Category</span><input id="p_cat" value="${esc(p ? p.category : '')}" placeholder="Grocery"></label>
      <label class="fld"><span>HSN (for GST bills)</span><input id="p_hsn" value="${esc(p ? p.hsn : '')}"></label>
      <label class="fld"><span>Base unit</span>
        <select id="p_unit">${['pcs', 'packet', 'box', 'kg', 'gram', 'ltr', 'ml', 'dozen', 'bundle', 'set'].map((u) => `<option ${p && p.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="fld"><span>Pieces per box</span><input id="p_ppb" type="number" step="any" min="1" value="${p ? num(p.ppb) || 1 : 1}"></label>
      <label class="fld"><span>Selling price / ${CUR} per unit *</span><input id="p_price" type="number" step="any" min="0" value="${p ? num(p.price) || '' : ''}"></label>
      <label class="fld"><span>Purchase cost / unit</span><input id="p_cost" type="number" step="any" min="0" value="${p ? num(p.cost) || '' : ''}"></label>
      <label class="fld"><span>GST %</span><input id="p_gst" type="number" step="any" min="0" value="${p ? num(p.gst) : num(S.settings.defaultGst)}"></label>
      <label class="fld"><span>Low-stock alert at</span><input id="p_low" type="number" step="any" min="0" value="${p ? num(p.lowStock) : num(S.settings.lowStockDefault)}"></label>
      <label class="fld"><span>${p ? 'Current' : 'Opening'} stock (${p ? esc(p.unit) : 'base units'})</span>
        <input id="p_stock" type="number" step="any" value="${p ? num(p.stock) : 0}" ${p ? 'readonly' : ''}></label>
    </div>
    ${p ? `<p class="note-line">Stock cannot be typed here — use <b>Stock in</b> or <b>Adjust</b> so every change is logged with a reason.</p>` : ''}
    <div class="modal-actions">
      <button class="btn primary" data-act="prod-save" data-id="${p ? p.id : ''}">${icon('check')} Save</button>
      ${p ? `<button class="btn danger" data-act="del-product" data-id="${p.id}">${icon('trash')} Delete</button>` : ''}
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
}
ACTIONS['prod-modal'] = (el) => {
  if (!requirePerm('stock', 'change the item list')) return;
  productModal((el.dataset && el.dataset.id) || null, () => render());
};
ACTIONS['prod-modal-from-bill'] = () => {
  if (!requirePerm('stock', 'add a new item')) return;
  productModal(null, () => { S.tab = 'bill'; render(); });
};

ACTIONS['prod-save'] = async (el) => {
  if (!requirePerm('stock', 'change the item list')) return;
  const id = el.dataset.id || '';
  const name = document.getElementById('p_name').value.trim();
  if (!name) return UI.toast('Item name is required', 'warn');
  const existing = id ? findProduct(id) : null;
  const obj = {
    id: existing ? existing.id : uid('prod'),
    name, code: document.getElementById('p_code').value.trim(),
    brand: document.getElementById('p_brand').value.trim(),
    category: document.getElementById('p_cat').value.trim(),
    hsn: document.getElementById('p_hsn').value.trim(),
    unit: document.getElementById('p_unit').value,
    ppb: num(document.getElementById('p_ppb').value) || 1,
    price: num(document.getElementById('p_price').value),
    cost: num(document.getElementById('p_cost').value),
    gst: num(document.getElementById('p_gst').value),
    lowStock: num(document.getElementById('p_low').value),
    stock: existing ? num(existing.stock) : num(document.getElementById('p_stock').value),
    createdAt: existing ? existing.createdAt : new Date().toISOString()
  };
  await ACT.save('products', obj, S, true);
  if (!existing && num(obj.stock) !== 0) {
    await ACT.save('moves', {
      id: uid('mv'), date: todayISO(), productId: obj.id, productName: obj.name, qty: num(obj.stock),
      type: 'purchase', refLabel: 'Opening stock', unit: obj.unit, note: 'Opening stock while creating item',
      value: round2(num(obj.stock) * num(obj.cost)), createdAt: new Date().toISOString()
    }, S, true);
  }
  UI.toast(existing ? 'Item updated' : 'Item added');
  UI.closeModal();
  render();
};

ACTIONS['del-product'] = async (el) => {
  if (!requirePerm('stock', 'delete items')) return;
  const p = findProduct(el.dataset.id);
  if (!p) return;
  if (!confirm(`Delete item "${p.name}"?\n\nPast bills keep their record. Stock of ${packDisplay(p.stock, p.ppb, p.unit)} will be removed from your stock list.`)) return;
  await ACT.remove('products', p.id, S, true);
  UI.closeModal();
  render();
  UI.toast('Item deleted');
};

/* ------------------------- stock in ------------------------- */
function stockInModal(preset = {}) {
  const p = preset.productId ? findProduct(preset.productId) : null;
  const unit = p ? p.unit : 'pcs';
  const ppb = p ? num(p.ppb) : 1;
  UI.openModal('Stock in (purchase)', `
    <div class="form-grid">
      <label class="fld wide"><span>Item *</span><select id="si_prod">${productOptions(preset.productId || '')}</select></label>
      <label class="fld"><span>Quantity received *</span><input id="si_qty" type="number" step="any" min="0" placeholder="0"></label>
      <label class="fld"><span>Received as</span>
        <select id="si_unit"><option value="unit">${esc(unit)}</option>${ppb > 1 ? '<option value="box">box</option>' : ''}</select></label>
      ${can('cost') ? `<label class="fld"><span>Cost / unit ${CUR}</span><input id="si_cost" type="number" step="any" min="0" value="${p ? num(p.cost) || '' : ''}"></label>` : ''}
      <label class="fld"><span>Date</span><input id="si_date" type="date" value="${preset.date || todayISO()}"></label>
      <label class="fld wide"><span>Supplier / bill reference</span><input id="si_sup" placeholder="e.g. Sharma Traders, bill 221"></label>
      <label class="fld wide"><span>Note</span><input id="si_note" placeholder="optional"></label>
    </div>
    <p class="note-line">Need a new item? <button class="btn ghost sm" data-act="prod-modal" type="button">Create item first</button></p>
    <div class="modal-actions">
      <button class="btn primary" data-act="stock-in-save" data-id="${preset.productId || ''}">${icon('check')} Add to stock</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
  const sel = document.getElementById('si_prod');
  if (sel) sel.onchange = () => {
    const pp = findProduct(sel.value);
    const uSel = document.getElementById('si_unit');
    const cIn = document.getElementById('si_cost');
    if (pp && cIn) {
      uSel.innerHTML = `<option value="unit">${esc(pp.unit)}</option>${num(pp.ppb) > 1 ? '<option value="box">box</option>' : ''}`;
      cIn.value = num(pp.cost) || '';
    }
  };
  const uSel = document.getElementById('si_unit');
  if (uSel) uSel.onchange = () => {
    const pp = findProduct(sel.value);
    const cIn = document.getElementById('si_cost');
    if (!cIn) return;
    if (pp && uSel.value === 'box') cIn.value = round2(num(pp.cost) * num(pp.ppb));
    else if (pp) cIn.value = num(pp.cost) || '';
  };
}
ACTIONS['stock-in-modal'] = (el) => {
  if (!requirePerm('stock', 'add stock')) return;
  stockInModal({ productId: (el.dataset && el.dataset.id) || '' });
};
ACTIONS['stock-in-save'] = async () => {
  if (!requirePerm('stock', 'add stock')) return;
  const siProd = document.getElementById('si_prod');
  if (!siProd) return;                          // the form is no longer on screen
  const productId = siProd.value;
  if (!productId) return UI.toast('Choose an item', 'warn');
  const qty = num(document.getElementById('si_qty').value);
  if (qty <= 0) return UI.toast('Enter quantity received', 'warn');
  const sellUnit = document.getElementById('si_unit').value;
  const p = findProduct(productId);
  const costEl = document.getElementById('si_cost');
  const costTyped = costEl ? num(costEl.value) : num(p.cost);   // no cost field → keep the item's own cost
  const costPerBase = sellUnit === 'box' && num(p.ppb) > 1 ? round2(costTyped / num(p.ppb)) : costTyped;
  await ACT.stockIn({
    productId, qty, sellUnit, cost: costPerBase, date: document.getElementById('si_date').value,
    supplier: document.getElementById('si_sup').value.trim(),
    note: document.getElementById('si_note').value.trim(), type: 'purchase'
  }, S);
  UI.closeModal();
  render();
};

/* ------------------------- adjust / damage ------------------------- */
function adjustModal(productId) {
  const p = findProduct(productId);
  if (!p) return;
  UI.openModal('Adjust stock — ' + p.name, `
    <div class="form-grid">
      <label class="fld"><span>Physical count / correct stock</span><input id="ad_count" type="number" step="any" value="${num(p.stock)}"></label>
      <label class="fld"><span>Date</span><input id="ad_date" type="date" value="${todayISO()}"></label>
      <label class="fld wide"><span>Reason</span>
        <select id="ad_reason">
          <option>Physical count correction</option>
          <option>Damage / breakage</option>
          <option>Expiry</option>
          <option>Returned to supplier</option>
          <option>Staff / self use</option>
          <option>Sample / free</option>
          <option>Other</option>
        </select></label>
      <label class="fld wide"><span>Note</span><input id="ad_note" placeholder="optional detail"></label>
    </div>
    <p class="note-line">System stock right now: <b>${packDisplay(p.stock, p.ppb, p.unit)}</b>. Enter what you actually counted — the difference is recorded as a stock movement.</p>
    <div class="modal-actions">
      <button class="btn primary" data-act="adjust-save" data-id="${p.id}">${icon('check')} Save adjustment</button>
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
}
ACTIONS['adjust-modal'] = (el) => {
  if (!requirePerm('stock', 'adjust stock')) return;
  adjustModal(el.dataset.id);
};
ACTIONS['adjust-save'] = async (el) => {
  if (!requirePerm('stock', 'adjust stock')) return;
  const adCount = document.getElementById('ad_count');
  if (!adCount) return;
  const counted = num(adCount.value);
  const reason = document.getElementById('ad_reason').value;
  const note = document.getElementById('ad_note').value.trim();
  await ACT.stockAdjust(el.dataset.id, counted, reason + (note ? ' — ' + note : ''), S, document.getElementById('ad_date').value);
  UI.closeModal();
  render();
};

/* ------------------------- product history ------------------------- */
ACTIONS['prod-history'] = (el) => {
  const p = findProduct(el.dataset.id);
  if (!p) return;
  const hist = productHistory(p.id);
  const sold = round2(hist.filter((m) => num(m.qty) < 0).reduce((s, m) => s + num(m.qty), 0));
  const bought = round2(hist.filter((m) => num(m.qty) > 0).reduce((s, m) => s + num(m.qty), 0));
  UI.openModal(p.name + ' — stock history', `
    <div class="mini-stats four">
      <div><small>In stock now</small><b>${packDisplay(p.stock, p.ppb, p.unit)}</b></div>
      <div><small>Total received</small><b class="ok-t">+${qtyFmt(bought)}</b></div>
      <div><small>Total out</small><b class="bad-t">${qtyFmt(sold)}</b></div>
      <div><small>${can('cost') ? 'Stock value' : 'Low-stock alert'}</small><b>${can('cost') ? money(num(p.stock) * num(p.cost)) : qtyFmt(p.lowStock) + ' ' + esc(p.unit)}</b></div>
    </div>
    ${hist.length ? `<div class="table-wrap"><table class="mini-table">
      <thead><tr><th>Date</th><th>Reason</th><th>Ref</th><th class="r">Qty</th><th class="r">Balance after</th></tr></thead>
      <tbody>${(() => {
        let bal = 0;
        const rowsAsc = hist.slice().reverse().map((m) => { bal = round2(bal + num(m.qty)); return { ...m, bal }; }).reverse();
        return rowsAsc.map((m) => `<tr><td>${fmtDateShort(m.date)}</td><td>${esc(typeLabel(m.type))}${m.note ? `<small>${esc(m.note)}</small>` : ''}</td>
          <td>${esc(m.refLabel || '')}</td><td class="r ${num(m.qty) >= 0 ? 'ok-t' : 'bad-t'}">${num(m.qty) > 0 ? '+' : ''}${qtyFmt(m.qty)}</td>
          <td class="r b">${qtyFmt(m.bal)}</td></tr>`).join('');
      })()}</tbody></table></div>` : '<div class="pad muted">No movements recorded.</div>'}
    <div class="modal-actions">
      ${can('stock') ? `<button class="btn" data-act="stock-in-modal" data-id="${p.id}">${icon('pkg')} Stock in</button>
      <button class="btn ghost" data-act="adjust-modal" data-id="${p.id}">${icon('settings2')} Adjust</button>` : ''}
      <button class="btn ghost" data-act="open-product" data-id="${p.id}">Edit item</button>
    </div>`, { wide: true });
};

ACTIONS['open-product'] = (el) => {
  if (!requirePerm('stock', 'change the item list')) return;
  productModal(el.dataset.id, () => render());
};
ACTIONS['recalc-stock'] = async () => {
  if (!requirePerm('stock', 'rebuild stock')) return;
  if (!confirm('Rebuild each item\'s stock from the movement history?\n\nUse this if stock looks wrong (e.g. after importing old data).')) return;
  await ACT.recalcStock(S);
  render();
};
ACTIONS['export-products'] = () => {
  const withCost = can('cost');
  const rows = S.products.map((p) => ({
    name: p.name, code: p.code || '', category: p.category || '', unit: p.unit, ppb: num(p.ppb),
    stock: num(p.stock), low: num(p.lowStock), cost: withCost ? num(p.cost) : '', price: num(p.price),
    gst: num(p.gst), value: withCost ? round2(num(p.stock) * num(p.cost)) : ''
  }));
  download(`stock_${todayISO()}.csv`, csv(rows, [
    { label: 'Item', value: 'name' }, { label: 'Code', value: 'code' }, { label: 'Category', value: 'category' },
    { label: 'Unit', value: 'unit' }, { label: 'Pcs per box', value: 'ppb' }, { label: 'Stock', value: 'stock' },
    { label: 'Low alert', value: 'low' }, { label: 'Cost', value: 'cost' }, { label: 'Price', value: 'price' },
    { label: 'GST %', value: 'gst' }, { label: 'Stock value', value: 'value' }
  ]), 'text/csv');
  UI.toast(can('cost') ? 'Stock CSV downloaded' : 'Price list downloaded (cost columns are owner-only)');
};
ACTIONS['export-moves'] = () => {
  const rows = (S.moves || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  download(`stock_movements_${todayISO()}.csv`, csv(rows, [
    { label: 'Date', value: 'date' }, { label: 'Item', value: 'productName' }, { label: 'Qty', value: 'qty' },
    { label: 'Unit', value: 'unit' }, { label: 'Type', value: 'type' }, { label: 'Reference', value: 'refLabel' },
    { label: 'Note', value: 'note' }, { label: can('cost') ? 'Value' : 'Reference', value: can('cost') ? 'value' : 'refLabel' }
  ]), 'text/csv');
  UI.toast('Movement log downloaded');
};
