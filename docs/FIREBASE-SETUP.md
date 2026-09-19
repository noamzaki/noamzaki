# Firebase setup — copy-paste guide

Everything you have to tick, paste and publish in the Firebase console, in order.
Total time: about 10 minutes. Cost: ₹0 on the free plan.

---

## 0. Before you start

Have these ready:

* the `index.html` file of this repo (that is the whole app)
* your shop login email, e.g. `owner@yourshop.com` (make one up — it is only used to sign in,
  nothing is emailed to it unless you later click "forgot password")

---

## 1. Create the project

1. <https://console.firebase.google.com> → **Add project**
2. Name it something like `my-wholesale-store` → Continue
3. Google Analytics: **off** (not needed) → **Create project**

---

## 2. Turn on Email/Password sign-in

**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**

(Without this the app shows *"Email/Password sign-in is not enabled"*.)

---

## 3. Create YOUR login (the owner)

**Authentication → Users → Add user**

* Email: `owner@yourshop.com` (any address you control / can remember)
* Password: something strong — this is the shop's master login

> The **first** account that signs in to the app claims ownership automatically
> (it is written to `settings/main.ownerUids`). So create this user **before** anyone else signs in.
> Staff should never be added here by hand — add them from the app's **Staff** screen instead.

---

## 4. Create the database

**Build → Firestore Database → Create database**

* Mode: **Production mode** (the rules you paste in step 5 replace the defaults anyway)
* Location: **asia-south1 (Mumbai)** — nearest to you, fastest, and it cannot be changed later

---

## 5. Publish the security rules  ⚠️ the important step

**Firestore Database → Rules** → select everything in the editor → delete → paste this →
**Publish**

```javascript
rules_version = '2';

// ─────────────────────────────────────────────────────────────────────────────
//  Firestore security rules — Wholesale Store Billing + Customer Portal
//  Paste this in:  Firebase → Firestore Database → Rules → Publish
//
//  What these rules do
//   1. Only YOUR account (the first one that signs in claims ownership) and the
//      staff logins you create in the app can read/write the shop data.
//   2. A customer who logs in to the portal can read ONLY their own customer
//      record, their own bills and their own payments. Nothing else.
//   2b. Staff follow the permissions you tick on the Staff screen: the same
//      can('bill' | 'stock' | ...) checks run here, on the server, so a disabled
//      switch or unticked box cannot be bypassed from another device.
//   3. The shop's name/phone/address is public so the portal login page can show it.
// ─────────────────────────────────────────────────────────────────────────────
service cloud.firestore {
  match /databases/{database}/documents {

    // ── the owner(s): uids listed in settings/main.ownerUids ────────────────
    //    The first account that signs in claims ownership; you can add more
    //    uids there by hand (Firebase → Firestore → settings/main → ownerUids).
    function ownerUids() {
      return get(/databases/$(database)/documents/settings/main).data.ownerUids;
    }
    function isOwner() {
      return request.auth != null && request.auth.uid in ownerUids();
    }

    // ── staff members: a staff/{their-uid} document created by the owner ────
    function staffDoc() {
      return get(/databases/$(database)/documents/staff/$(request.auth.uid)).data;
    }
    function hasStaffDoc() {
      return request.auth != null && exists(/databases/$(database)/documents/staff/$(request.auth.uid));
    }
    function isShopUser() {
      return isOwner() || (hasStaffDoc() && staffDoc().active == true);
    }
    // may this signed-in person do `perm`?  (owner can do everything)
    function can(perm) {
      return isOwner() || (hasStaffDoc() && staffDoc().active == true && staffDoc().perms[perm] == true);
    }

    // ── who is the customer we are looking at ────────────────────────────────
    // The customer record stores the customer's Firebase uid in `authUid`
    // (the app fills it in when you create their login).
    function isMeCustomerDoc(customerId) {
      return request.auth != null
        && get(/databases/$(database)/documents/customers/$(customerId)).data.authUid == request.auth.uid;
    }

    // ── staff records: the owner manages them, an employee may read their own ──
    match /staff/{uid} {
      allow read: if isOwner() || (request.auth != null && request.auth.uid == uid);
      allow write: if isOwner();
    }

    // ── 1. shop data, permission by permission ──────────────────────────────
    match /settings/{doc} {
      // the very first signed-in account claims ownership
      allow create: if request.auth != null && !exists(/databases/$(database)/documents/settings/main)
        && request.auth.uid in request.resource.data.ownerUids;
      allow read: if isShopUser();
      allow update, delete: if isOwner();
    }
    match /products/{doc} {
      allow read: if isShopUser();
      allow write: if can('stock');
    }
    match /moves/{doc} {
      allow read: if can('stock') || can('reports');
      // billing writes sale movements, stock work writes the rest
      allow create: if can('bill') || can('stock');
      allow update, delete: if can('stock');
    }
    match /customers/{doc} {
      allow read: if isShopUser();               // billing needs names/balances
      allow write: if can('khata') || can('bill');
      allow delete: if isOwner();
    }
    match /invoices/{doc} {
      allow read: if isShopUser();
      allow create: if can('bill');
      // editing an existing bill is the same privilege as deleting it (the app
      // hides the Edit button without deleteBill, so the rules match the screen)
      allow update: if can('deleteBill');
      allow delete: if can('deleteBill');
    }
    match /payments/{doc} {
      allow read: if isShopUser();
      allow create: if can('payment') || can('bill');   // "received now" while billing
      allow delete: if can('deletePayment');
      allow update: if false;
    }

    // ── 2. customer portal: read-only, own records only ─────────────────────
    //    (these rules come after the staff ones: a customer account has no
    //     staff document, so can()/isShopUser() are false for them)
    match /customers/{customerId} {
      // the portal app queries: where('authUid','==', myUid)
      allow read: if request.auth != null && resource.data.authUid == request.auth.uid;
      allow write: if false;                                  // customers never change anything
    }
    match /invoices/{invoiceId} {
      // the portal app queries: where('customerId','==', myCustomerDocId)
      allow read: if isMeCustomerDoc(resource.data.customerId);
      allow write: if false;
    }
    match /payments/{paymentId} {
      allow read: if isMeCustomerDoc(resource.data.customerId);
      allow write: if false;
    }

    // ── 3. public shop card (only name/phone/address — the same details that
    //      are printed on every bill). Staff can update it from Settings.
    match /portal_shop/{doc} {
      allow read: if true;
      allow write: if can('settings') || isOwner();
    }

    // products / moves / settings and everything else: staff only (covered above).
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Notes
//  • Staff logins must NOT use the same email as a customer login. Customer
//    logins are created by the app as  <id>@customers.wholesale-billing.app
//    (or whatever you set in window.PORTAL_DOMAIN), so they can never collide
//    with your own address.
//  • Add or change staff inside the app (Staff screen) — it creates the Firebase
//    accounts and the staff/{uid} documents these rules read. Nothing to edit here.
//  • To make someone else an owner, add their uid to settings/main.ownerUids.
//  • Never use  allow read, write: if true  — customers' balances and your
//    sales would be public.
//  • Changing these rules only affects the app AFTER you press Publish.
// ─────────────────────────────────────────────────────────────────────────────
```

What this locks down:

| Who | Can do |
|---|---|
| Owner (your uid in `settings/main.ownerUids`) | everything |
| Staff login you created in the app + `active` ON | exactly the permissions ticked on the Staff screen (`can('bill')`, `can('stock')`, …) |
| Staff switched OFF (`active: false`) | nothing — refused instantly, on every device |
| Customer portal login | read **only** their own customer record, their own bills, their own payments — never write |
| Anyone not signed in | only the public `portal_shop` card (shop name/phone/address, the same details printed on every bill) |

The rules run **on Google's servers**, so they hold even if someone opens the app on another
phone or edits the page in their browser.

---

## 6. Paste your web config into the app

1. Project settings (**⚙️**) → **Your apps** → Web (**`</>`**) → register app (nickname: `shop`) →
   **copy the `firebaseConfig` object**
2. Open **`src/index.html`** and find the block at the top:

```html
window.FIREBASE_CONFIG = {
  apiKey: "",            // ← paste your values
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
```

3. Fill it in, then rebuild the single file:

```bash
python3 build.py        # rebuilds index.html from src/
```

*(If you never run `build.py`, you can paste into the `FIREBASE_CONFIG` block at the top of
`index.html` itself — just remember a later build would overwrite it.)*

4. Commit + push `index.html` to GitHub Pages.

---

## 7. Sign in once, as the owner

Open your site → the app now shows a **login screen** → sign in with the user from step 3.
This first sign-in:

* claims ownership (`settings/main.ownerUids = [your uid]`)
* creates the `settings/main` document with your shop details
* turns the yellow "Local mode" banner into a green **Synced** badge

If you already had data in Local mode, do a **Settings → Backup → Download JSON** first, then
**Restore** it once you are signed in, so the shop data lands in Firestore.

---

## 8. Add your staff from inside the app

**Staff → Add staff** → name, email, password, role. The app creates the real Firebase Auth
account *and* the `staff/{uid}` permission document that the rules read. Nothing to add in the
console.

* Switch someone off → **Staff → ON/OFF** → their login stops working immediately.
* FireBase holds staff passwords (the owner cannot type one in) → **Staff → their name → Send
  password reset**.
* Remove someone → **Remove** in the app, and delete them in **Authentication → Users** if you
  want the email account gone too.

---

## 9. Authorise your website domain

**Authentication → Settings → Authorized domains → Add domain** → `<your-username>.github.io`

`localhost` is already allowed by default, so local testing works out of the box.

---

## 10. Final checklist

| ✔ | What to see |
|---|---|
| ☐ | App opens with a **login screen** (not onboarding) |
| ☐ | Signing in with the owner user shows the shop with a green **Synced** badge |
| ☐ | **Staff** tab → add a staffer → their permissions list shows correctly |
| ☐ | Signing in as that staffer shows a smaller menu and no profit/cost figures |
| ☐ | Rules page shows today's publish date |
| ☐ | A customer login (`/#customer`) opens after you publish `portal_shop` |
| ☐ | **Settings → Backup** downloads a JSON of your shop |

---

## 11. Do I need Firestore indexes?

No. Every query in the app filters on **one** field only (`where('authUid','==',uid)`,
`where('customerId','==',id)`) and all sorting happens inside the app. Single-field indexes are
automatic, so nothing to create. If Firebase ever shows an "index required" link in the console,
just click it — it builds itself.

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing or insufficient permissions` | Rules not published yet (step 5), or you are signed in with an account that is neither owner nor staff. |
| `The caller does not have permission` right after sign-in | Your uid is not in `settings/main.ownerUids` — the first sign-in sets it; if someone else signed in first, add your uid by hand in Firestore → `settings/main`. |
| Staff login says "not enabled in the shop app" | No `staff/{uid}` document — add them from the app's Staff screen (or switch them back ON). |
| Staff login says "switched off" | `active: false` in their staff document — Staff → ON/OFF. |
| "domain not authorised" | Step 9 (add `<your-username>.github.io`). |
| "Email/Password sign-in is not enabled" | Step 2. |
| Customer portal says "rules are not ready" | Publish the rules (step 5) — the portal reads `portal_shop`, which the rules must allow. |
| Everyone can read my data | You are still on the default test-mode rules. Paste step 5 and Publish. |

---

*The rules file in this repo is [`firestore.rules`](../firestore.rules) — keep the two in sync if
you change anything. The built app never contains the rules; they live only in the console.*
