/* =========================================================================
   STAFF & PERMISSIONS
   - Role presets the owner can pick (Manager / Cashier / Counter+Stock / Store keeper)
   - Per-permission checkboxes for anything custom
   - Firebase mode: each staff member gets a real Firebase login (their own email +
     password). firestore.rules enforces what they may read/write.
   - Local mode: owner password + staff PIN/password on this device (the browser
     checks it — good for a shared counter PC, not internet-grade security)
   ========================================================================= */

/* ------------------------------------------------------------------ */
/*  Permission model                                                  */
/* ------------------------------------------------------------------ */
const PERMS = [
  { id: 'bill', label: 'Make bills (New Bill, Bills list, reprint)', group: 'Work' },
  { id: 'payment', label: 'Take payments (record khata payments, receipts)', group: 'Work' },
  { id: 'khata', label: 'See customers & khata balances, send reminders', group: 'Work' },
  { id: 'stock', label: 'Stock in, adjust stock, stock log, add items', group: 'Stock' },
  { id: 'reports', label: 'See reports & sales figures', group: 'Money' },
  { id: 'cost', label: 'See purchase cost, profit and stock value', group: 'Money' },
  { id: 'deleteBill', label: 'Edit or delete bills (changes stock back)', group: 'Risky' },
  { id: 'deletePayment', label: 'Delete a payment entry', group: 'Risky' },
  { id: 'settings', label: 'Change shop settings (GST, invoice numbers, backup)', group: 'Admin' },
  { id: 'data', label: 'Backup, restore, delete all data', group: 'Admin' },
  { id: 'staff', label: 'Add / remove staff logins', group: 'Admin' },
  { id: 'portal', label: 'Create customer logins (customer portal)', group: 'Admin' }
];
const ALL_PERMS = PERMS.map((p) => p.id);

const ROLES = [
  { id: 'owner', label: 'Owner (me)', desc: 'Everything, including settings and staff.', perms: ALL_PERMS },
  {
    id: 'manager', label: 'Manager', desc: 'Runs the shop: billing, payments, stock, reports, cost & profit. No staff, no backup/wipe.',
    perms: ['bill', 'payment', 'khata', 'stock', 'reports', 'cost', 'deleteBill', 'deletePayment', 'settings', 'portal']
  },
  {
    id: 'counter', label: 'Counter + Stock', desc: 'Billing, payments, khata and stock work. No profit, no reports, no deleting.',
    perms: ['bill', 'payment', 'khata', 'stock']
  },
  {
    id: 'cashier', label: 'Cashier (billing only)', desc: 'Billing, payments and khata balances. No stock changes, no reports, no cost.',
    perms: ['bill', 'payment', 'khata']
  },
  {
    id: 'store', label: 'Store keeper', desc: 'Stock in, adjustments, item list and khata balances. Cannot bill or take money.',
    perms: ['stock', 'khata']
  },
  { id: 'custom', label: 'Custom…', desc: 'Tick exactly what this person may do.', perms: ['bill'] }
];
function roleById(id) { return ROLES.find((r) => r.id === id) || ROLES[ROLES.length - 1]; }
function permsForRole(roleId, custom) {
  const r = roleById(roleId);
  if (roleId === 'custom') return Object.assign({}, custom || {});
  const out = {};
  ALL_PERMS.forEach((p) => { out[p] = r.perms.includes(p); });
  return out;
}
function permLabels(perms) {
  const on = PERMS.filter((p) => perms && perms[p.id]).map((p) => p.label.replace(/ \(.*\)/, ''));
  return on.length ? on.join(' · ') : 'no access yet';
}

/* ------------------------------------------------------------------ */
/*  Current session: who is using the app and what may they do        */
/* ------------------------------------------------------------------ */
function can(perm) {
  if (!perm) return true;
  if (!S.session) return true;                       // before login / legacy local install
  if (S.session.role === 'owner' || S.session.isOwner) return true;
  return !!(S.session.perms && S.session.perms[perm]);
}
function isOwnerSession() { return !S.session || S.session.role === 'owner' || !!S.session.isOwner; }
function sessionLabel() {
  if (!S.session) return '';
  return S.session.name || S.session.email || 'User';
}

/** Which permission a screen needs. null = everyone signed in. */
const VIEW_PERMS = {
  dash: null, bill: 'bill', khata: 'khata', payments: 'payment', products: 'stock',
  reports: 'reports', invoices: 'bill', settings: 'settings', staff: 'staff'
};
function canOpenView(tab) {
  const need = VIEW_PERMS[tab];
  return !need || can(need);
}

/** Guard for actions: refuse (with a message) if the session may not do this. */
function requirePerm(perm, what) {
  if (can(perm)) return true;
  UI.toast('Only the owner has permission to ' + (what || perm) + ' on this login', 'warn', 6000);
  return false;
}

/* ------------------------------------------------------------------ */
/*  Signing staff in — local mode (single device)                     */
/* ------------------------------------------------------------------ */
const LOCAL_AUTH = {
  /* Owner credentials live in their own local key — never inside the shop settings,
     so they are never synced to Firebase and never overwritten by a settings save. */
  _read() { try { return JSON.parse(localStorage.getItem('wb_owner_auth') || 'null'); } catch (e) { return null; } },
  _write(v) { try { if (v) localStorage.setItem('wb_owner_auth', JSON.stringify(v)); else localStorage.removeItem('wb_owner_auth'); } catch (e) { } },
  ownerInfo() { return this._read(); },
  async ownerPasswordSet() { const a = this._read(); return !!(a && a.hash); },
  async setOwnerPassword(email, password) {
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    this._write({ email: String(email || '').trim().toLowerCase(), salt, hash, setAt: new Date().toISOString() });
    return true;
  },
  async clearOwnerPassword() { this._write(null); return true; },
  async login(id, password) {
    const data = DB._readLocal() || {};
    const s = data.settings || {};
    const who = String(id || '').trim().toLowerCase();
    const owner = this._read();
    if (owner && owner.hash) {
      const ownerEmail = String(owner.email || '').toLowerCase();
      if (who === ownerEmail || who === 'owner' || who === 'me') {
        if (await verifyPassword(password, owner.salt, owner.hash)) {
          return { role: 'owner', isOwner: true, name: s.ownerName || 'Owner', email: ownerEmail, uid: 'local-owner' };
        }
        throw { code: 'local/bad-password', message: 'Wrong password.' };
      }
    }
    const staff = (data.staff || []).find((x) =>
      String(x.email || '').toLowerCase() === who || String(x.login || '').toLowerCase() === who);
    if (!staff) throw { code: 'local/no-user', message: 'No login with that ID on this device.' };
    if (staff.active === false) throw { code: 'local/disabled', message: 'This login has been switched off by the owner.' };
    const ok = await verifyPassword(password, staff.pinSalt, staff.pinHash);
    if (!ok) throw { code: 'local/bad-password', message: 'Wrong password.' };
    return {
      role: staff.role, isOwner: false, name: staff.name, email: staff.email,
      uid: 'local-' + staff.id, staffId: staff.id, perms: permsForRole(staff.role, staff.customPerms)
    };
  }
};

/* ------------------------------------------------------------------ */
/*  Resolving the session after Firebase sign-in                      */
/* ------------------------------------------------------------------ */
/**
 * Firebase mode: the owner's uid lives in settings/main.ownerUids (claimed by the
 * first signed-in account, and editable in Settings → Staff). Everyone else must
 * have a staff record with their uid, flagged active.
 */
async function resolveFirebaseSession(user) {
  if (!user) return null;
  const f = DB._fb;
  if (!f) return { role: 'owner', isOwner: true, name: user.email, email: user.email, uid: user.uid };
  const { doc, getDoc, setDoc } = f.api;
  let settings = null;
  try {
    const snap = await getDoc(doc(f.db, 'settings', 'main'));
    settings = snap.exists() ? snap.data() : null;
  } catch (e) { console.warn('settings read failed', e); }

  const ownerUids = (settings && settings.ownerUids) || [];
  let claimed = false;
  if (!ownerUids.length) {
    // first-ever login claims ownership (the account had to be created in Firebase by the owner)
    try {
      await setDoc(doc(f.db, 'settings', 'main'), {
        ownerUids: [user.uid], ownerEmails: [user.email || ''], ownerUidsSetAt: new Date().toISOString()
      }, { merge: true });
      claimed = true;
    } catch (e) { console.warn('could not claim ownership', e); }
  }
  if (claimed || ownerUids.includes(user.uid)) {
    return { role: 'owner', isOwner: true, name: (settings && settings.ownerName) || user.email, email: user.email, uid: user.uid, claimed };
  }
  // staff?
  try {
    const snap = await getDoc(doc(f.db, 'staff', user.uid));
    if (snap.exists()) {
      const st = snap.data();
      if (st.active === false) throw { code: 'staff/disabled' };
      return {
        role: st.role || 'custom', isOwner: false, name: st.name || user.email, email: user.email,
        uid: user.uid, staffId: user.uid, perms: permsForRole(st.role, st.customPerms)
      };
    }
  } catch (e) {
    if (e && e.code === 'staff/disabled') throw e;
    console.warn('staff lookup failed', e);
  }
  throw { code: 'staff/not-enabled' };
}

/** Create a login for a staff member (Firebase mode) and store their permissions */
async function createStaffLogin({ name, email, password, role, customPerms, phone }) {
  if (DB.mode !== 'firebase') {
    // local mode: store a PIN/password hash on this device
    const salt = newSalt();
    const rec = {
      id: uid('staff'), name, email: String(email || '').toLowerCase(), phone: phone || '',
      role, customPerms: role === 'custom' ? customPerms : null, active: true,
      mode: 'local', pinSalt: salt, pinHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };
    await ACT.save('staff', rec, S, true);
    return { local: true, record: rec };
  }
  const inst = await DB._secondaryApp('staff-admin-' + Date.now());
  try {
    const cred = await inst.api.createUserWithEmailAndPassword(inst.auth, email, password);
    const uidNew = cred.user.uid;
    await inst.api.signOut(inst.auth);
    const rec = {
      id: uidNew, uid: uidNew, name, email: String(email).toLowerCase(), phone: phone || '',
      role, customPerms: role === 'custom' ? customPerms : null, active: true,
      mode: 'firebase', createdBy: (DB.user && DB.user.email) || '', createdAt: new Date().toISOString()
    };
    await ACT.save('staff', rec, S, true);       // doc id = auth uid → the rules use it
    return { local: false, record: rec };
  } catch (e) {
    const map = {
      'auth/email-already-in-use': 'That email already has a login. If it is an old staff account, delete it in Firebase → Authentication first.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Enter a valid email for this staff member.'
    };
    throw { code: e.code, message: map[e.code] || e.message };
  } finally {
    try { await inst.api.deleteApp(inst.app); } catch (e) { }
  }
}

/* ------------------------------------------------------------------ */
/*  Staff screen (owner only)                                         */
/* ------------------------------------------------------------------ */
VIEWS.staff = function () {
  if (!can('staff')) return `<div class="view">${card('', `<div class="empty">${icon('lock')}<p>Only the owner can manage staff logins.</p></div>`)}</div>`;
  const list = (S.staff || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const owners = S.settings.ownerEmails || [];
  return `<div class="view">
    ${card('Who can use this app', `
      <div class="stat-line"><span><b>${list.length}</b> staff logins</span>
        <span>${owners.length ? 'Owner: <b>' + esc(owners.join(', ')) + '</b>' : '<b class="warn-t">Owner not claimed yet</b>'}</span>
        <span>Mode: <b>${DB.mode === 'firebase' ? 'Firebase logins (secure)' : 'This device only (local)'}</b></span></div>
      <div class="modal-actions left">
        <button class="btn primary" data-act="staff-modal">${icon('plus')} Add staff</button>
        <button class="btn ghost" data-act="staff-roles-help">What can each role do?</button>
        ${DB.mode !== 'firebase' ? `<button class="btn ghost" data-act="staff-owner-password">${icon('lock')} Owner login on this device</button>` : ''}
      </div>
      ${DB.mode !== 'firebase' ? `<p class="note-line"><b>Local mode:</b> logins are checked inside this browser. Set an owner password below so staff
        cannot open the shop file as you. For real security (each person on their own phone, rules enforced in the cloud) connect Firebase.</p>`
      : `<p class="note-line">Each staff member signs in with their own email + password. What they may see and do is enforced by
        <code>firestore.rules</code> — publish the rules from <a href="#" data-act="setup-help">Setup guide</a> after adding staff.</p>`}
    `)}

    ${list.length ? card('Staff', `<div class="list">${list.map((st) => {
      const perms = permsForRole(st.role, st.customPerms);
      const role = roleById(st.role);
      return `<div class="row" ${st.role === 'manager' || st.role === 'custom' ? '' : ''}>
        <div class="avatar ${st.active === false ? 'warn' : 'ok'}">${esc((st.name || 'S').slice(0, 1).toUpperCase())}</div>
        <div class="row-main">
          <b>${esc(st.name)} ${st.active === false ? '<span class="pill bad">switched off</span>' : ''}</b>
          <small>${esc(role.label)} · ${esc(st.email || '')}${st.phone ? ' · ' + esc(st.phone) : ''}</small>
          <small class="perm-line">${esc(permLabels(perms))}</small>
        </div>
        <div class="row-actions">
          ${st.phone ? `<button class="icon-btn" data-act="staff-send" data-id="${st.id}" title="Send login details">${icon('wa')}</button>` : ''}
          <button class="icon-btn" data-act="staff-edit" data-id="${st.id}" title="Edit">${icon('edit')}</button>
          <button class="icon-btn" data-act="staff-toggle" data-id="${st.id}" title="${st.active === false ? 'Switch on' : 'Switch off'}">${icon(st.active === false ? 'check' : 'minus')}</button>
          <button class="icon-btn danger" data-act="staff-remove" data-id="${st.id}" title="Remove">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('')}</div>`) : card('', emptyState('No staff added yet. You are using the app alone.', 'Add first staff member', 'staff-modal', 'user'))}
  </div>`;
};

function staffModal(id) {
  const st = id ? (S.staff || []).find((x) => x.id === id) : null;
  const role = st ? roleById(st.role) : roleById('counter');
  const perms = st ? permsForRole(st.role, st.customPerms) : permsForRole('counter');
  const initPw = randomPassword(8);

  UI.openModal(st ? 'Edit staff — ' + st.name : 'Add staff', `
    <div class="form-grid">
      <label class="fld"><span>Name *</span><input id="sf_name" value="${esc(st ? st.name : '')}" placeholder="e.g. Suresh (counter)"></label>
      <label class="fld"><span>Phone (for WhatsApp)</span><input id="sf_phone" value="${esc(st ? st.phone : '')}" placeholder="10-digit mobile"></label>
      <label class="fld wide"><span>Login email * <small class="muted">(they type this to sign in)</small></span>
        <input id="sf_email" value="${esc(st ? st.email : '')}" placeholder="suresh@yourshop.com" ${st && DB.mode === 'firebase' ? 'readonly' : ''}></label>
      <label class="fld wide"><span>Password ${st ? (DB.mode === 'firebase' ? '(Firebase holds it — send a reset link)' : '(leave blank to keep the old one)') : '(min 6)'}</span>
        <input id="sf_pass" value="${st && DB.mode === 'firebase' ? '' : (st ? '' : initPw)}" autocomplete="off" ${st && DB.mode === 'firebase' ? 'disabled placeholder="use Send password reset below"' : ''}></label>
      <label class="fld wide"><span>Role</span>
        <select data-change="staff-role" id="sf_role">
          ${ROLES.filter((r) => r.id !== 'owner' || isOwnerSession()).map((r) => `<option value="${r.id}" ${st && st.role === r.id ? 'selected' : ''}>${esc(r.label)} — ${esc(r.desc.slice(0, 70))}…</option>`).join('')}
        </select></label>
    </div>
    <div class="perm-box" id="sf_perms">${permsEditorHTML(perms, st ? st.role : 'counter')}</div>
    <p class="note-line">${DB.mode === 'firebase'
      ? 'A real Firebase login is created, so this person can work from their own phone. They can only do what is ticked above. Passwords are kept by Firebase — if they forget it, send a reset email instead of typing one here.'
      : 'This login works on this device only (local mode). Connect Firebase to give staff their own phone access.'}</p>
    <div class="modal-actions">
      <button class="btn primary" data-act="staff-save" data-id="${st ? st.id : ''}">${icon('check')} ${st ? 'Save changes' : 'Create login'}</button>
      ${st && DB.mode === 'firebase' ? `<button class="btn ghost" data-act="staff-reset-pass" data-id="${st.id}" data-email="${esc(st.email)}">${icon('lock')} Send password reset</button>` : ''}
      ${st && st.phone ? `<button class="btn ghost" data-act="staff-send" data-id="${st.id}">${icon('wa')} Send details</button>` : ''}
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
  S._staffInitPw = initPw;
}

function permsEditorHTML(perms, roleId) {
  const groups = ['Work', 'Stock', 'Money', 'Risky', 'Admin'];
  return `<div class="perm-head">${icon('check')} <b>What may this person do?</b>
      <span class="muted small">${esc(roleById(roleId).desc)}</span></div>
    <div class="perm-grid">
      ${groups.map((g) => `<div class="perm-group">
        <div class="pg-title">${g}</div>
        ${PERMS.filter((p) => p.group === g).map((p) => `
          <label class="check sm"><input type="checkbox" data-perm="${p.id}" ${perms[p.id] ? 'checked' : ''}
            ${roleId !== 'custom' ? 'disabled' : ''}> ${esc(p.label)}</label>`).join('')}
      </div>`).join('')}
    </div>
    ${roleId !== 'custom' ? '<p class="note-line">Choose role <b>Custom…</b> to tick individual permissions.</p>' : ''}`;
}

ACTIONS['staff-modal'] = () => { if (!requirePerm('staff', 'add staff')) return; staffModal(null); };
ACTIONS['staff-edit'] = (el) => { if (!requirePerm('staff', 'edit staff')) return; staffModal(el.dataset.id); };
ACTIONS['staff-role'] = (el) => {
  const box = document.getElementById('sf_perms');
  if (box) box.innerHTML = permsEditorHTML(permsForRole(el.value), el.value);
};
ACTIONS['staff-save'] = async (el) => {
  if (!requirePerm('staff', 'manage staff')) return;
  const id = el.dataset.id || '';
  const name = document.getElementById('sf_name').value.trim();
  const email = document.getElementById('sf_email').value.trim().toLowerCase();
  const phone = document.getElementById('sf_phone').value.trim();
  const pass = document.getElementById('sf_pass').value;
  const role = document.getElementById('sf_role').value;
  if (!name) return UI.toast('Enter the staff member name', 'warn');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return UI.toast('Enter a valid login email', 'warn');
  const customPerms = {};
  ALL_PERMS.forEach((p) => {
    const cb = document.querySelector(`[data-perm="${p}"]`);
    customPerms[p] = cb ? cb.checked : false;
  });
  const existing = id ? (S.staff || []).find((x) => x.id === id) : null;
  const clash = (S.staff || []).find((x) => x.email === email && x.id !== id);
  if (clash) return UI.toast('That email is already used for ' + clash.name, 'warn');

  try {
    if (!existing) {
      if (String(pass).length < 6) return UI.toast('Password must be at least 6 characters', 'warn');
      S._staffPw = pass;
      UI.toast('Creating login…', 'ok', 1500);
      const res = await createStaffLogin({ name, email, password: pass, role, customPerms, phone });
      UI.toast('Staff login created ✓');
    } else {
      existing.name = name; existing.phone = phone; existing.role = role;
      existing.customPerms = role === 'custom' ? customPerms : null;
      if (String(pass).length >= 6 && DB.mode !== 'firebase') {
        const salt = newSalt();
        existing.pinSalt = salt;
        existing.pinHash = await hashPassword(pass, salt);
        S._staffPw = pass;
      }
      await ACT.save('staff', existing, S, true);
      UI.toast('Staff updated ✓');
      if (String(pass).length >= 6 && DB.mode === 'firebase') {
        UI.toast('Firebase keeps staff passwords — use "Send password reset" so ' + existing.name + ' can set a new one', 'warn', 8000);
      }
      if (email !== existing.email) UI.toast('Note: login email cannot be changed here — remove and re-create the login to change it', 'warn', 7000);
    }
    UI.closeModal();
    render();
  } catch (e) {
    UI.toast(e.message || 'Could not save the staff login', 'warn', 8000);
  }
};

ACTIONS['staff-toggle'] = async (el) => {
  if (!requirePerm('staff', 'manage staff')) return;
  const st = (S.staff || []).find((x) => x.id === el.dataset.id);
  if (!st) return;
  st.active = st.active === false;
  await ACT.save('staff', st, S, true);
  UI.toast(st.name + (st.active ? ' can sign in again' : ' is switched off — cannot sign in'));
  render();
};

ACTIONS['staff-remove'] = async (el) => {
  if (!requirePerm('staff', 'manage staff')) return;
  const st = (S.staff || []).find((x) => x.id === el.dataset.id);
  if (!st) return;
  if (!confirm(`Remove ${st.name}?\n\nTheir login stops working immediately. Bills and payments they made stay in the records (they show who billed them).`)) return;
  await ACT.remove('staff', st.id, S, true);
  UI.toast('Removed ' + st.name + (DB.mode === 'firebase' ? '. Also delete the user in Firebase → Authentication for a full cleanup.' : ''), 'ok', 7000);
  render();
};

ACTIONS['staff-reset-pass'] = async (el) => {
  if (!requirePerm('staff', 'manage staff')) return;
  const st = (S.staff || []).find((x) => x.id === el.dataset.id);
  const email = (st && st.email) || el.dataset.email || '';
  if (!email) return UI.toast('No login email on record', 'warn');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return UI.toast('That email address looks wrong', 'warn');
  try {
    await DB.sendReset(email);
    UI.toast('Reset link mailed to ' + email + ' — ask them to open it and set a new password', 'ok', 8000);
  } catch (e) {
    UI.toast('Could not send the mail: ' + ((e && (e.code || e.message)) || 'unknown error'), 'warn', 8000);
  }
};

ACTIONS['staff-roles-help'] = () => {
  UI.openModal('What can each role do?', `
    <div class="table-wrap"><table class="mini-table">
      <thead><tr><th>Role</th><th>Can do</th></tr></thead>
      <tbody>${ROLES.map((r) => `<tr><td><b>${esc(r.label)}</b></td><td>${esc(r.desc)}
        <small class="muted">${esc(r.perms.slice(0, 12).map((p) => (PERMS.find((x) => x.id === p) || {}).label || p).join(' · '))}</small></td></tr>`).join('')}
      </tbody></table></div>
    <div class="modal-actions"><button class="btn primary" data-act="modal-close">Got it</button></div>`, { wide: true });
};

ACTIONS['staff-send'] = (el) => {
  const st = (S.staff || []).find((x) => x.id === el.dataset.id);
  if (!st) return;
  const pw = S._staffPw || '';
  const text = `${st.name} ji 🙏
*${S.settings.shopName || 'Shop'}* — billing app ka login:

🔗 ${location.origin + location.pathname}
📧 Email: ${st.email}
🔑 Password: ${pw || '(the password I told you)'}
👤 Role: ${roleById(st.role).label}

Aap sirf wahi kaam kar sakte ho jo owner ne allow kiya hai (${permLabels(permsForRole(st.role, st.customPerms))}).`;
  UI.openModal('Send login details — ' + st.name, `
    <div class="form-grid">
      <label class="fld wide"><span>Password to include</span><input id="ss_pw" value="${esc(pw)}" autocomplete="off" placeholder="type the password you set"></label>
      <label class="fld wide"><span>Message</span><textarea id="ss_text" rows="7">${esc(text)}</textarea></label>
    </div>
    <div class="modal-actions">
      ${st.phone ? `<button class="btn wa" data-act="staff-send-wa" data-id="${st.id}">${icon('wa')} Send on WhatsApp</button>` : ''}
      <button class="btn ghost" data-act="staff-send-copy">Copy message</button>
      <button class="btn ghost" data-act="modal-close">Close</button>
    </div>
    ${st.phone ? '' : '<p class="note-line">No phone saved — add one in Edit, or use Copy.</p>'}`);
};
ACTIONS['staff-send-wa'] = (el) => {
  const st = (S.staff || []).find((x) => x.id === el.dataset.id);
  if (!st || !st.phone) return UI.toast('No WhatsApp number saved for this staff member', 'warn');
  const pw = document.getElementById('ss_pw').value;
  const text = document.getElementById('ss_text').value.replace(/\(the password I told you\)/, pw || '(the password I told you)');
  waOpen(st.phone, text);
};
ACTIONS['staff-send-copy'] = async () => {
  const ok = await copyText(document.getElementById('ss_text').value);
  UI.toast(ok ? 'Message copied' : 'Could not copy', ok ? 'ok' : 'warn');
};

ACTIONS['staff-owner-password'] = () => {
  if (!requirePerm('staff', 'manage staff')) return;
  const info = LOCAL_AUTH.ownerInfo() || {};
  UI.openModal('Owner login on this device', `
    <p class="pad-top">Local mode has no cloud logins, so this browser checks them. Set an owner password so staff using this PC
      cannot open the shop as you. Staff sign in with the email + password you create in <b>Add staff</b>.</p>
    <div class="form-grid">
      <label class="fld wide"><span>Owner email (your login)</span><input id="op_email" value="${esc(info.email || S.settings.ownerEmail || '')}" placeholder="owner@yourshop.com"></label>
      <label class="fld wide"><span>New owner password</span><input id="op_pass" value="${esc(randomPassword(8))}" autocomplete="off"></label>
    </div>
    <p class="note-line">Write it somewhere safe. If you forget it you can still clear it from the browser's site data (that also erases the shop data — keep a backup!).</p>
    <div class="modal-actions">
      <button class="btn primary" data-act="staff-owner-password-save">${icon('check')} Save owner password</button>
      ${info.hash ? `<button class="btn danger" data-act="staff-owner-password-clear">Remove owner password (open without login)</button>` : ''}
      <button class="btn ghost" data-act="modal-close">Cancel</button>
    </div>`);
};
ACTIONS['staff-owner-password-save'] = async () => {
  const email = document.getElementById('op_email').value.trim();
  const pass = document.getElementById('op_pass').value;
  if (!email) return UI.toast('Enter the owner email you will sign in with', 'warn');
  if (String(pass).length < 6) return UI.toast('Password must be at least 6 characters', 'warn');
  await LOCAL_AUTH.setOwnerPassword(email, pass);
  UI.closeModal();
  UI.toast('Owner login saved — this device will now ask for it', 'ok', 5000);
  render();
};
ACTIONS['staff-owner-password-clear'] = async () => {
  if (!confirm('Remove the owner password? Anyone who opens this browser will be the owner again.')) return;
  await LOCAL_AUTH.clearOwnerPassword();
  UI.closeModal();
  UI.toast('Owner password removed');
  render();
};
