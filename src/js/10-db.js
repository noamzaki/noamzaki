/* =========================================================================
   DATA LAYER
   - If FIREBASE_CONFIG below is filled in  -> Firebase Auth + Firestore
   - If it is left blank                   -> Local mode (this browser only)
   The rest of the app only talks to the DB.* methods, so both modes behave
   exactly the same.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   Firebase config
   Paste your keys into the clearly-marked block at the TOP OF index.html
   (window.FIREBASE_CONFIG). Anything set there wins over these defaults.
   With no keys, the app runs in Local mode: it still works, but data stays in
   this browser only.
   --------------------------------------------------------------------------- */
const FIREBASE_DEFAULTS = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
const FIREBASE_CONFIG = Object.assign(
  {},
  FIREBASE_DEFAULTS,
  (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || {}
);

const COLLECTIONS = ['products', 'customers', 'invoices', 'payments', 'moves', 'staff'];
const LS_KEY = 'wholesale_billing_v1';
const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

const DB = {
  mode: 'local',           // 'local' | 'firebase'
  online: false,
  user: null,
  _fb: null,               // { app, auth, db, api }
  _unsubs: [],
  _localWrite: null,

  isConfigured() {
    return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId) && !this.forceLocal();
  },
  /** `?local=1` (or localStorage wb_force_local=1) keeps everything on this device even
   *  when Firebase keys are filled in — handy for trying the app out, demos and tests. */
  forceLocal() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('local') === '1' || q.get('mode') === 'local') return true;
      return localStorage.getItem('wb_force_local') === '1';
    } catch (e) { return false; }
  },

  /* ---------------- local helpers ---------------- */
  _readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') || null; } catch (e) { return null; }
  },
  _writeLocal(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: state.settings, products: state.products, customers: state.customers,
        invoices: state.invoices, payments: state.payments, moves: state.moves,
        staff: state.staff || [], savedAt: new Date().toISOString()
      }));
    } catch (e) { console.warn('local save failed', e); }
  },
  /** mirror every change locally so a network/outage never loses data */
  mirror(state) { try { this._writeLocal(state); } catch (e) { } },

  /* ---------------- init ---------------- */
  /** Load the Firebase SDK once and keep { app, auth, db, api } handy. */
  async _ensureFirebase() {
    if (this._fb) return this._fb;
    const appMod = await import(`${FB_SDK}/firebase-app.js`);
    const authMod = await import(`${FB_SDK}/firebase-auth.js`);
    const fsMod = await import(`${FB_SDK}/firebase-firestore.js`);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
    this._fb = { app, auth, db, api: { ...authMod, ...fsMod }, apps: {} };
    return this._fb;
  },
  /** A *separate* Firebase app instance — its login is independent of the shop's,
   *  so a customer signing in never signs the owner out (and vice-versa). */
  async _secondaryApp(name) {
    const f = await this._ensureFirebase();
    const key = name || 'portal';
    if (f.apps[key]) return f.apps[key];
    const appMod = await import(`${FB_SDK}/firebase-app.js`);
    const authMod = await import(`${FB_SDK}/firebase-auth.js`);
    const fsMod = await import(`${FB_SDK}/firebase-firestore.js`);
    const app = appMod.initializeApp(FIREBASE_CONFIG, key);
    const auth = authMod.getAuth(app);
    const db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
    f.apps[key] = { app, auth, db, api: { ...authMod, ...fsMod } };
    return f.apps[key];
  },

  async init(onData, onAuth) {
    if (!this.isConfigured()) {
      this.mode = 'local';
      const data = this._readLocal();
      onData(data || null);
      return { mode: 'local' };
    }
    try {
      const f = await this._ensureFirebase();
      const authMod = f.api;
      this.mode = 'firebase';
      this.online = true;
      f.api.onAuthStateChanged(f.auth, (user) => {
        this.user = user;
        onAuth(user);
      });
      return { mode: 'firebase' };
    } catch (e) {
      console.error('Firebase init failed, falling back to local mode', e);
      this.mode = 'local';
      this.online = false;
      onData(this._readLocal());
      return { mode: 'local', error: e.message };
    }
  },

  /** Portal page: set Firebase up (if configured) without subscribing to shop data. */
  async initPortal() {
    if (!this.isConfigured()) { this.mode = 'local'; return { mode: 'local' }; }
    try {
      await this._ensureFirebase();
      this.mode = 'firebase';
      this.online = true;
      return { mode: 'firebase' };
    } catch (e) {
      this.mode = 'local';
      return { mode: 'local', error: e.message };
    }
  },

  /** Non-sensitive shop card the customer portal shows before login
   *  (kept in /portal_shop/main, readable without signing in). */
  async publishShopInfo(settings) {
    if (this.mode !== 'firebase') return false;
    try {
      const f = await this._ensureFirebase();
      const { doc, setDoc } = f.api;
      await setDoc(doc(f.db, 'portal_shop', 'main'), {
        shopName: settings.shopName || '', phone: settings.phone || '', address: settings.address || '',
        gstin: settings.gstin || '', terms: settings.terms || '', currency: settings.currency || '₹',
        portalEnabled: settings.portalEnabled !== false,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return true;
    } catch (e) { console.warn('publishShopInfo failed', e); return false; }
  },
  async readShopInfo() {
    if (this.mode !== 'firebase') {
      const d = this._readLocal() || {};
      return d.settings || null;
    }
    try {
      const f = await this._ensureFirebase();
      const snap = await f.api.getDoc(f.api.doc(f.db, 'portal_shop', 'main'));
      return snap.exists() ? snap.data() : null;
    } catch (e) { return null; }
  },

  async login(email, password) {
    const f = this._fb;
    if (!f) throw new Error('Firebase not configured');
    await f.api.signInWithEmailAndPassword(f.auth, email, password);
  },
  async logout() {
    if (this._fb) await this._fb.api.signOut(this._fb.auth);
  },
  async sendReset(email) {
    const f = this._fb;
    if (!f) return;
    await f.api.sendPasswordResetEmail(f.auth, email);
  },

  /* ---------------- reads ---------------- */
  /** Live-load all collections. cb({products,customers,invoices,payments,moves,settings}) */
  async loadAll(cb) {
    if (this.mode !== 'firebase') {
      const d = this._readLocal() || {};
      cb({
        settings: d.settings || null, products: d.products || [], customers: d.customers || [],
        invoices: d.invoices || [], payments: d.payments || [], moves: d.moves || [],
        staff: d.staff || [], settingsExists: !!d.settings
      });
      return;
    }
    const f = this._fb;
    const { collection, doc, onSnapshot, getDoc } = f.api;
    this._unsubs.forEach((u) => { try { u(); } catch (e) { } });
    this._unsubs = [];
    const bucket = { settings: null, settingsExists: false, products: [], customers: [], invoices: [], payments: [], moves: [], staff: [] };

    const snap = await getDoc(doc(f.db, 'settings', 'main'));
    if (snap.exists()) { bucket.settings = snap.data(); bucket.settingsExists = true; }
    cb({ ...bucket });

    COLLECTIONS.forEach((c) => {
      const un = onSnapshot(collection(f.db, c), (qs) => {
        bucket[c] = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
        cb({ ...bucket });
      }, (err) => {
        console.error('snapshot error on ' + c, err);
        UI.toast('Sync problem: ' + err.code + ' — working from local copy', 'warn', 6000);
      });
      this._unsubs.push(un);
    });
    const unS = onSnapshot(doc(f.db, 'settings', 'main'), (d) => {
      bucket.settings = d.exists() ? d.data() : null;
      bucket.settingsExists = d.exists();
      cb({ ...bucket });
    }, (e) => { });
    this._unsubs.push(unS);
  },

  /* ---------------- writes ---------------- */
  async put(coll, obj) {
    const clean = JSON.parse(JSON.stringify(obj));
    if (this.mode !== 'firebase') return clean;
    const f = this._fb;
    const { doc, setDoc } = f.api;
    const { id, ...rest } = clean;
    await setDoc(doc(f.db, coll, id), rest, { merge: true });
    return clean;
  },
  async del(coll, id) {
    if (this.mode !== 'firebase') return true;
    const f = this._fb;
    const { doc, deleteDoc } = f.api;
    await deleteDoc(doc(f.db, coll, id));
    return true;
  },
  async putSettings(settings) {
    if (this.mode !== 'firebase') return settings;
    const f = this._fb;
    const { doc, setDoc } = f.api;
    const { _id, ...rest } = settings;
    await setDoc(doc(f.db, 'settings', 'main'), rest, { merge: true });
    return settings;
  },
  async wipeRemote() {
    if (this.mode !== 'firebase') return;
    const f = this._fb;
    const { collection, getDocs, deleteDoc, doc } = f.api;
    for (const c of COLLECTIONS) {
      const qs = await getDocs(collection(f.db, c));
      for (const d of qs.docs) await deleteDoc(doc(f.db, c, d.id));
    }
  }
};

/* ------------------------------------------------------------------ */
/*  CUSTOMER PORTAL — login + read-only data for one customer          */
/*  Firebase mode: real Firebase Auth accounts, locked down by rules    */
/*  (see firestore.rules). Local mode: checked on this device only.     */
/* ------------------------------------------------------------------ */
const PORTAL_DOMAIN = (typeof window !== 'undefined' && window.PORTAL_DOMAIN) || 'customers.wholesale-billing.app';

const PORTAL_DB = {
  /** Which mode the portal login should use */
  mode() { return DB.mode === 'firebase' ? 'firebase' : 'local'; },

  /* ---------------- sign in / out ---------------- */
  async signIn(userId, password) {
    const email = portalEmail(userId, PORTAL_DOMAIN);
    if (!email || !password) throw { code: 'portal/missing-fields' };
    if (DB.mode !== 'firebase') return this._localSignIn(userId, password);
    const inst = await DB._secondaryApp('portal');
    const { signInWithEmailAndPassword } = inst.api;
    try {
      const cred = await signInWithEmailAndPassword(inst.auth, email, password);
      return { uid: cred.user.uid, email: cred.user.email, local: false };
    } catch (e) {
      throw this._friendly(e);
    }
  },
  async signOut() {
    if (DB.mode !== 'firebase') { try { sessionStorage.removeItem('wb_portal'); } catch (e) { } return; }
    const inst = await DB._secondaryApp('portal');
    await inst.api.signOut(inst.auth);
  },
  /** Is a customer already signed in on this device? */
  async currentUser() {
    if (DB.mode !== 'firebase') {
      try {
        const id = JSON.parse(sessionStorage.getItem('wb_portal') || 'null');
        return id ? { local: true, customerId: id.customerId, username: id.username } : null;
      } catch (e) { return null; }
    }
    const inst = await DB._secondaryApp('portal');
    const u = inst.auth.currentUser;
    return u ? { uid: u.uid, email: u.email, local: false } : null;
  },

  _friendly(e) {
    const map = {
      'auth/invalid-credential': 'Wrong login ID or password.',
      'auth/wrong-password': 'Wrong password.',
      'auth/user-not-found': 'This login ID does not exist. Ask the shop to create it again.',
      'auth/invalid-email': 'That login ID is not valid.',
      'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
      'auth/network-request-failed': 'No internet connection. Try again once you are online.',
      'auth/user-disabled': 'This login has been switched off by the shop.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase key problem — tell the shop owner (Settings → Setup guide).'
    };
    return { code: e.code || 'portal/error', message: map[e.code] || (e.message || 'Could not sign in.') };
  },

  _localSignIn(userId, password) {
    const data = DB._readLocal() || {};
    const uname = String(userId || '').trim().toLowerCase();
    const cust = (data.customers || []).find((c) => c.portal && c.portal.active !== false &&
      (String(c.portal.username || '').toLowerCase() === uname ||
        String(c.portal.username || '').toLowerCase() === uname.replace(/\s+/g, '')));
    if (!cust) throw { code: 'portal/no-user', message: 'No customer login with that ID. Ask the shop to create it.' };
    return verifyPassword(password, cust.portal.salt, cust.portal.passHash).then((ok) => {
      if (!ok) throw { code: 'portal/bad-password', message: 'Wrong password. Please check with the shop.' };
      try { sessionStorage.setItem('wb_portal', JSON.stringify({ customerId: cust.id, username: cust.portal.username })); } catch (e) { }
      return { local: true, customerId: cust.id, username: cust.portal.username };
    });
  },

  /* ---------------- owner-side account management ---------------- */
  /** Create the Firebase Auth account for a customer login (keeps the owner signed in) */
  async createLogin(userId, password) {
    const email = portalEmail(userId, PORTAL_DOMAIN);
    if (DB.mode !== 'firebase') return { email, uid: '', local: true };
    const inst = await DB._secondaryApp('portal-admin-' + Date.now());
    const { createUserWithEmailAndPassword, signOut, deleteApp } = inst.api;
    try {
      const cred = await createUserWithEmailAndPassword(inst.auth, email, password);
      const uid = cred.user.uid;
      await signOut(inst.auth);
      return { email, uid, local: false };
    } catch (e) {
      const map = {
        'auth/email-already-in-use': 'This login ID is already taken — choose another (or the old account was left behind in Firebase → Authentication).',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'That login ID is not valid.'
      };
      throw { code: e.code, message: map[e.code] || e.message };
    } finally {
      try { await inst.api.deleteApp(inst.app); } catch (e) { }
    }
  },
  /** Change a customer's password (the owner knows the current one) */
  async changePassword(userId, currentPassword, newPassword) {
    const email = portalEmail(userId, PORTAL_DOMAIN);
    if (DB.mode !== 'firebase') return { local: true };
    const inst = await DB._secondaryApp('portal-admin-' + Date.now());
    try {
      await inst.api.signInWithEmailAndPassword(inst.auth, email, currentPassword);
      await inst.api.updatePassword(inst.auth.currentUser, newPassword);
      await inst.api.signOut(inst.auth);
      return { local: false };
    } catch (e) {
      const map = {
        'auth/invalid-credential': 'Current password is wrong. If it was changed and forgotten, remove the login and create it again.',
        'auth/wrong-password': 'Current password is wrong.',
        'auth/weak-password': 'New password must be at least 6 characters.'
      };
      throw { code: e.code, message: map[e.code] || e.message };
    } finally {
      try { await inst.api.deleteApp(inst.app); } catch (e) { }
    }
  },
  /** Remove a customer's login */
  async deleteLogin(userId, currentPassword) {
    const email = portalEmail(userId, PORTAL_DOMAIN);
    if (DB.mode !== 'firebase') return { local: true };
    const inst = await DB._secondaryApp('portal-admin-' + Date.now());
    try {
      await inst.api.signInWithEmailAndPassword(inst.auth, email, currentPassword);
      await inst.api.deleteUser(inst.auth.currentUser);
      await inst.api.signOut(inst.auth);
      return { local: false };
    } catch (e) {
      return { local: false, warning: 'Could not delete the login in Firebase (' + (e.code || e.message) + '). The customer record was cleared here — also remove the user in Firebase → Authentication for a full cleanup.' };
    } finally {
      try { await inst.api.deleteApp(inst.app); } catch (e) { }
    }
  },

  /* ---------------- reading one customer's data ---------------- */
  /**
   * Live-load everything this customer is allowed to see.
   * cb({ customer, invoices, payments, shop, error })
   */
  async load(cb) {
    if (DB.mode !== 'firebase') return this._loadLocal(cb);
    const inst = await DB._secondaryApp('portal');
    const { collection, doc, getDoc, getDocs, onSnapshot, query, where } = inst.api;
    const uid = inst.auth.currentUser ? inst.auth.currentUser.uid : '';
    if (!uid) return cb({ error: 'not-signed-in' });
    const shop = await this.readShop();
    // the customer doc the rules link to this auth account
    let customer = null;
    try {
      const qs = await getDocs(query(collection(inst.db, 'customers'), where('authUid', '==', uid)));
      if (!qs.empty) customer = { id: qs.docs[0].id, ...qs.docs[0].data() };
    } catch (e) {
      console.error(e);
      return cb({ error: 'rules', message: (e.code || e.message) });
    }
    if (!customer) return cb({ error: 'no-customer', shop });
    const bucket = { customer, invoices: [], payments: [], shop };
    const emit = () => cb({ ...bucket });
    onSnapshot(query(collection(inst.db, 'invoices'), where('customerId', '==', customer.id)),
      (qs) => { bucket.invoices = qs.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
      (e) => console.error('portal invoices', e));
    onSnapshot(query(collection(inst.db, 'payments'), where('customerId', '==', customer.id)),
      (qs) => { bucket.payments = qs.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
      (e) => console.error('portal payments', e));
    emit();
  },

  _loadLocal(cb) {
    const id = (() => { try { return JSON.parse(sessionStorage.getItem('wb_portal') || 'null'); } catch (e) { return null; } })();
    const data = DB._readLocal() || {};
    if (!id) return cb({ error: 'not-signed-in' });
    const customer = (data.customers || []).find((c) => c.id === id.customerId);
    if (!customer) return cb({ error: 'no-customer' });
    cb({
      customer,
      invoices: (data.invoices || []).filter((i) => i.customerId === customer.id),
      payments: (data.payments || []).filter((p) => p.customerId === customer.id),
      shop: data.settings || null
    });
  },

  async readShop() {
    try {
      const f = await DB._ensureFirebase();
      const snap = await f.api.getDoc(f.api.doc(f.db, 'portal_shop', 'main'));
      return snap.exists() ? snap.data() : null;
    } catch (e) { return null; }
  }
};

const DB_ = DB; // alias used by tests

/* ------------------------------------------------------------------ */
/* Business actions — every write goes through here (mirror + persist)  */
/* ------------------------------------------------------------------ */
const ACT = {
  saving: 0,

  async save(coll, obj, state, quiet) {
    const isNew = !state[coll].some((x) => x.id === obj.id);
    obj.updatedAt = new Date().toISOString();
    if (isNew) obj.createdAt = obj.updatedAt;
    const i = state[coll].findIndex((x) => x.id === obj.id);
    if (i >= 0) state[coll][i] = obj; else state[coll].push(obj);
    DB.mirror(state);
    if (!quiet) UI.toast((isNew ? 'Saved ' : 'Updated ') + coll.slice(0, -1));
    try {
      this.saving++;
      await DB.put(coll, obj);
    } catch (e) {
      console.error(e);
      UI.toast('Could not save to cloud: ' + (e.code || e.message) + ' (saved on this device)', 'warn', 7000);
    } finally {
      this.saving--;
      UI.syncBadge();
    }
    return obj;
  },

  async remove(coll, id, state, quiet) {
    state[coll] = state[coll].filter((x) => x.id !== id);
    DB.mirror(state);
    if (!quiet) UI.toast('Deleted');
    try { await DB.del(coll, id); }
    catch (e) { UI.toast('Cloud delete failed: ' + (e.code || e.message), 'warn', 7000); }
    return true;
  },

  async saveSettings(patch, state) {
    state.settings = { ...state.settings, ...patch };
    DB.mirror(state);
    DB.publishShopInfo(state.settings);      // brand the customer portal (fire & forget)
    try { await DB.putSettings(state.settings); }
    catch (e) { UI.toast('Settings sync failed (kept locally)', 'warn', 6000); }
    return state.settings;
  },

  /** Create or update an invoice + adjust stock + write stock movements */
  async saveInvoice(inv, state, isEdit) {
    const prev = isEdit ? state.invoices.find((x) => x.id === inv.id) : null;
    const saved = await this.save('invoices', inv, state, true);

    // reverse stock of the previous version first (edit case)
    if (prev) await this._reverseStock(prev, state, 'Bill ' + prev.no + ' edited', inv.date);

    const moves = [];
    (inv.lines || []).forEach((l) => {
      if (!l.productId) return;
      const p = state.products.find((x) => x.id === l.productId);
      if (!p) return;
      const q = baseQty(l.qty, l.sellUnit, p.unit, p.ppb);
      const wasBox = l.sellUnit === 'box' && num(l.ppb) > 0;
      moves.push({
        id: uid('mv'), date: inv.date, productId: p.id, productName: p.name,
        qty: -q, type: 'sale', ref: inv.id, refLabel: 'Bill ' + inv.no,
        unit: p.unit, note: wasBox ? `${qtyFmt(l.qty)} box × ${qtyFmt(l.ppb)} = ${qtyFmt(q)} ${p.unit}` : '',
        value: -round2(num(l.cost) * q), createdAt: new Date().toISOString()
      });
      p.stock = round2(num(p.stock) - q);
    });
    for (const m of moves) await this.save('moves', m, state, true);
    for (const l of (inv.lines || [])) {
      if (!l.productId) continue;
      const p = state.products.find((x) => x.id === l.productId);
      if (p) await this.save('products', p, state, true);
    }
    UI.toast(prev ? 'Bill updated ✓' : 'Bill saved ✓');
    return saved;
  },

  async _reverseStock(inv, state, reason, date) {
    const moves = [];
    (inv.lines || []).forEach((l) => {
      if (!l.productId) return;
      const p = state.products.find((x) => x.id === l.productId);
      if (!p) return;
      const q = baseQty(l.qty, l.sellUnit, p.unit, p.ppb);
      moves.push({
        id: uid('mv'), date: date || inv.date, productId: p.id, productName: p.name,
        qty: q, type: 'reverse', ref: inv.id, refLabel: 'Bill ' + inv.no + ' cancelled / edited',
        unit: p.unit, note: reason, value: round2(num(l.cost) * q), createdAt: new Date().toISOString()
      });
      p.stock = round2(num(p.stock) + q);
    });
    for (const m of moves) await this.save('moves', m, state, true);
    for (const l of (inv.lines || [])) {
      if (!l.productId) continue;
      const p = state.products.find((x) => x.id === l.productId);
      if (p) await this.save('products', p, state, true);
    }
  },

  async deleteInvoice(inv, state) {
    await this._reverseStock(inv, state, 'Bill ' + inv.no + ' deleted', inv.date);
    await this.remove('invoices', inv.id, state, true);
    UI.toast('Bill deleted, stock returned ✓');
  },

  /** Stock IN / adjustment */
  async stockIn(patch, state) {
    const p = state.products.find((x) => x.id === patch.productId);
    if (!p) throw new Error('Product not found');
    const q = baseQty(patch.qty, patch.sellUnit, p.unit, p.ppb);
    const oldStock = num(p.stock);
    p.stock = round2(oldStock + q);
    if (patch.type === 'purchase' && num(patch.cost) > 0) p.cost = avgCost(oldStock, p.cost, q, patch.cost);
    if (patch.newPrice) p.price = round2(patch.newPrice);
    const mv = {
      id: uid('mv'), date: patch.date || todayISO(), productId: p.id, productName: p.name,
      qty: q, type: patch.type || 'purchase', ref: uid('in'), refLabel: patch.supplier || 'Stock in',
      unit: p.unit, note: patch.note || '', value: round2(num(patch.cost || p.cost) * q), createdAt: new Date().toISOString()
    };
    await this.save('products', p, state, true);
    await this.save('moves', mv, state, true);
    UI.toast(`Stock updated: ${p.name} +${qtyFmt(q)} ${p.unit}`);
    return p;
  },

  /** Set counted stock (physical count / damage) */
  async stockAdjust(productId, countedQty, note, state, date) {
    const p = state.products.find((x) => x.id === productId);
    if (!p) throw new Error('Product not found');
    const delta = round2(num(countedQty) - num(p.stock));
    p.stock = round2(num(countedQty));
    await this.save('products', p, state, true);
    await this.save('moves', {
      id: uid('mv'), date: date || todayISO(), productId: p.id, productName: p.name, qty: delta,
      type: 'adjust', refLabel: 'Stock adjustment', unit: p.unit, note: note || 'Physical count',
      value: round2(delta * num(p.cost)), createdAt: new Date().toISOString()
    }, state, true);
    UI.toast(`Adjusted ${p.name} by ${delta >= 0 ? '+' : ''}${qtyFmt(delta)} ${p.unit}`);
  },

  /** Rebuild every product's stock from the movement history (repair tool) */
  async recalcStock(state) {
    let fixed = 0;
    for (const p of state.products) {
      const total = round2((state.moves || []).filter((m) => m.productId === p.id).reduce((s, m) => s + num(m.qty), 0));
      if (round2(num(p.stock)) !== total) { p.stock = total; fixed++; await this.save('products', p, state, true); }
    }
    UI.toast(fixed ? `Recalculated stock for ${fixed} item(s)` : 'Stock already matches the movement history ✓');
  },

  async savePayment(pay, state) {
    await this.save('payments', pay, state, true);
    UI.toast(`Payment ${money(pay.amount)} recorded ✓`);
    return pay;
  }
};
