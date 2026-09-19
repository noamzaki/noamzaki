/* =========================================================================
   APP SHELL — state, icons, toast, modal, navigation, delegated events
   ========================================================================= */

const ICONS = {
  dash: '<path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6ZM13 9h8V3h-8v6Z"/>',
  bill: '<path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.6H8V12Zm0 4h8v1.6H8V16Zm0-8h4v1.6H8V8Z"/>',
  invoice: '<path d="M4 3h16v18l-2.5-1.6L15 21l-2.5-1.6L10 21l-2.5-1.6L5 21V3Zm3 4v1.6h10V7H7Zm0 4v1.6h10V11H7Zm0 4v1.6h6V15H7Z"/>',
  khata: '<path d="M5 2h14a2 2 0 0 1 2 2v18l-3-2-2 2-2-2-2 2-2-2-3 2V4a2 2 0 0 1 2-2Zm3 5v1.6h8V7H8Zm0 4v1.6h8V11H8Zm0 4v1.6h5V15H8Z"/>',
  cash: '<path d="M2 6h20v12H2V6Zm10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 9v6h1.5a4 4 0 0 1 0-6H5Zm14 0h-1.5a4 4 0 0 1 0 6H19V9Z"/>',
  box: '<path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.5 3.6L12 11.5 5.5 7.9 12 4.3ZM5 9.6l6 3.3v6.5l-6-3.3V9.6Zm8 9.8v-6.5l6-3.3v6.5l-6 3.3Z"/>',
  chart: '<path d="M4 20V4h2v16H4Zm4 0V10h2v10H8Zm4 0V6h2v14h-2Zm4 0v-7h2v7h-2Zm4 0V8h2v12h-2Z"/>',
  gear: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4-.1-1.2 1.6-1.3-1.7-3-2 .7a8 8 0 0 0-2-1.2L17 3.6h-3.5l-.2 2.1a8 8 0 0 0-2 1.2l-2-.7-1.7 3 1.6 1.3-.1 1.2.1 1.2-1.6 1.3 1.7 3 2-.7c.6.5 1.3.9 2 1.2l.2 2.1H17l.2-2.1c.7-.3 1.4-.7 2-1.2l2 .7 1.7-3-1.6-1.3.1-1.2Z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/>',
  minus: '<path d="M5 11h14v2H5z"/>',
  print: '<path d="M7 3h10v4H7V3ZM5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2Zm4 6v4h6v-4H9Z"/>',
  wa: '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1a11 11 0 0 1-5.6-4.9c-.4-.7-.4-1.4-.2-2 .1-.4.6-1 1-1.1.3-.1.7 0 .8.4l.6 1.4c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.3 0 .6.4.7 1.2 1.5 2 1.9.3.2.5.1.6 0l.6-.6c.2-.2.4-.2.6-.1l1.4.7c.4.2.5.5.4.8Z"/>',
  trash: '<path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z"/>',
  edit: '<path d="M4 17.2 15.4 5.8l2.8 2.8L6.8 20H4v-2.8ZM17 4.2l1.4-1.4a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1 0 1.4L19.8 7 17 4.2Z"/>',
  search: '<path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"/>',
  close: '<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/>',
  back: '<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z"/>',
  check: '<path d="M9.6 16.2 4.8 11.4 3.4 12.8l6.2 6.2L21.4 7.2l-1.4-1.4z"/>',
  cloud: '<path d="M6.5 19a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.7 9.3 3.9 3.9 0 0 1 17.5 19h-11Z"/>',
  warn: '<path d="M12 2 1 21h22L12 2Zm-1 6h2v7h-2V8Zm0 9h2v2h-2v-2Z"/>',
  download: '<path d="M11 3h2v9.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4L11 12.2V3ZM4 19h16v2H4v-2Z"/>',
  up: '<path d="M12 4l6 6-1.4 1.4L13 7.8V20h-2V7.8L7.4 11.4 6 10l6-6Z"/>',
  down: '<path d="M12 20l-6-6 1.4-1.4L11 16.2V4h2v12.2l3.6-3.6L18 14l-6 6Z"/>',
  user: '<path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 11c4.4 0 8 2.4 8 5.4V21H4v-1.6C4 16.4 7.6 14 12 14Z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.4l4 2.4-1 1.7-5-3V7h2Z"/>',
  pkg: '<path d="M12 2 4 6.2v11.6L12 22l8-4.2V6.2L12 2Zm0 2.3 5.6 2.9L12 10.1 6.4 7.2 12 4.3ZM6 9l5 2.6v7.4l-5-2.6V9Zm7 10v-7.4L18 9v7.4L13 19Z"/>',
  settings2: '<path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/>'
};
function icon(name, cls) {
  return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const DEFAULT_SETTINGS = {
  shopName: 'My Wholesale Store',
  ownerName: '',
  phone: '',
  address: '',
  gstin: '',
  invoicePrefix: 'INV-',
  nextInvoiceNo: 1,
  taxEnabled: true,
  priceIncludesTax: false,
  roundOff: true,
  lowStockDefault: 5,
  terms: 'Goods once sold will not be taken back.',
  paymentModes: ['Cash', 'UPI', 'Bank', 'Cheque'],
  currency: '₹',
  countryCode: '91',
  waMode: 'auto',        // 'auto' | 'web' (PC) | 'app' (phone)
  waAutoCopy: false,     // also copy the message to the clipboard
  seeded: false
};

const S = {
  settings: { ...DEFAULT_SETTINGS },
  products: [], customers: [], invoices: [], payments: [], moves: [], staff: [],
  session: null,          // { role, perms, name, email } — who is using the app
  tab: 'dash',
  ready: false,
  filters: { inv: { q: '', from: '', to: '', cust: '', status: '' }, prod: { q: '', low: false }, khata: { q: '', onlyDue: false }, pay: { from: '', to: '' } },
  range: { from: addDaysISO(todayISO(), -29), to: todayISO() },
  open: { customerId: null, invoiceId: null, productId: null },
  bill: null,
  loginError: ''
};

function blankBill() {
  return {
    id: uid('inv'), no: '', date: todayISO(), customerId: '', lines: [],
    disc: { type: 'none', value: 0 }, note: '', paidNow: 0, payMode: 'Cash',
    deliveryNote: '', _editing: false
  };
}

/* ---------------- toast ---------------- */
const UI = {
  toasts: [],
  toast(msg, kind = 'ok', ms = 3000) {
    const id = uid('t');
    this.toasts.push({ id, msg, kind });
    this.renderToasts();
    setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); this.renderToasts(); }, ms);
  },
  renderToasts() {
    const host = document.getElementById('toasts');
    if (!host) return;
    host.innerHTML = this.toasts.map((t) => `<div class="toast ${t.kind}">${icon(t.kind === 'ok' ? 'check' : t.kind === 'warn' ? 'warn' : 'warn')}<span>${esc(t.msg)}</span></div>`).join('');
  },
  syncBadge() {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    const dots = ACT.saving ? `<span class="dot busy"></span>` : '';
    if (DB.mode === 'firebase') {
      el.className = 'badge live';
      el.innerHTML = `${dots}${icon('cloud')}<span>${DB.user ? 'Synced' : 'Signed out'}</span>`;
    } else {
      el.className = 'badge local';
      el.innerHTML = `${icon('warn')}<span>Local only</span>`;
    }
  },

  /* ---------------- modal ---------------- */
  modal: null,
  openModal(title, bodyHTML, opts = {}) {
    this.modal = { title, body: bodyHTML, opts };
    this.renderModal();
  },
  closeModal() {
    this.modal = null;
    this.renderModal();
  },
  renderModal() {
    const host = document.getElementById('modal-host');
    if (!host) return;
    if (!this.modal) { host.innerHTML = ''; host.classList.remove('open'); return; }
    const wide = this.modal.opts.wide ? ' wide' : '';
    host.classList.add('open');
    host.innerHTML = `<div class="modal-back" data-act="modal-close"></div>
      <div class="modal${wide}">
        <div class="modal-head"><h3>${esc(this.modal.title)}</h3>
          <button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('close')}</button></div>
        <div class="modal-body">${this.modal.body}</div>
      </div>`;
  }
};

/* ---------------- event delegation ---------------- */
const ACTIONS = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.change];
  if (!fn) return;
  fn(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.input];
  if (!fn) return;
  fn(el, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && UI.modal) UI.closeModal();
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    const s = document.querySelector('[data-search-focus]');
    if (s) { e.preventDefault(); s.focus(); }
  }
});

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
