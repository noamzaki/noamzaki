# Dukaan Guide — roz ka kaam (owner's one-pager)

Ye app aapki dukaan ke liye: **bill**, **khata (udhaar)**, **stock**. Sab kuch apne aap.

---

## Roz subah
1. App kholo (phone ke home screen icon se ya bookmark se).
2. **Home** screen dekho — aaj ki sales, kal ka pending, low-stock items.

## Bill banana (2 step mein)
1. Neeche **New Bill** dabao.
2. Customer chuno — *Cash customer* ya khata wale ka naam.
3. **Search box** mein item ka naam likho (jaise `sugar`) aur **Enter** dabao — item bill mein aa jayega.
4. Qty, rate, discount, GST — jo change karna hai kar lo. **Box** mein bech rahe ho to Unit ko `box` kar do
   (1 box = 12 pcs set kiya hua hai to 24 pcs apne aap stock se kat jayenge).
5. Customer abhi kuch paise de raha hai to **Received now** mein likho (jaise 500), baaki apne aap khata mein chala jayega.
6. **Save bill** dabao.

Bill ke baad: **Send bill on WhatsApp** (hare rang ka button) ya **Print bill**.

WhatsApp button kaise kaam karta hai:
* **Counter PC par** → WhatsApp Web ka tab khul jayega (jisme aap already logged in ho) aur customer ki chat
  **khulegi hi khul jayegi, poora bill pehle se typed hoga** — sirf **Send** dabana hai.
* **Mobile par** → WhatsApp app khulega us customer ki chat ke saath, bill typed hua — sirf **Send**.
* Customer ka number 10 digit me save hai to `91` apne aap lag jata hai.
* Number nahi saved? Button ek baar number maangega, save karega, phir chat khol dega.
* App khud kuch **send nahi** karta — bhejne ke liye aapko Send dabana padta hai. (Isliye galat customer ko
  chala bhi jaye to bhejne se pehle aap dekh sakte ho.)

Aur WhatsApp buttons:
* **Khata → customer → Payment reminder** — kitna udhaar baaki hai, purane bill ke saath.
* **Khata → customer → Send khata statement** — poora hisaab (har bill, har payment, closing balance).
* **Payment → receipt ke saath WhatsApp icon** — payment mila, itna baaki hai.

## Raat ko payment lena (jo log 5–7 baar maal le jaate hain)
1. **Payment** tab kholo → **Record payment**.
2. Customer chuno → Amount likho → mode (Cash / UPI / Bank).
3. **Save payment**.
4. App khud **purana (sabse pehla) bill pehle clear karega** — jaisa notebook mein karte ho.
5. Receipt **Print** kar sakte ho ya WhatsApp par confirmation bhej sakte ho.

> Zyada paisa aa gaya to wo **advance** ban jata hai (green mein dikhega) — bill kabhi minus nahi hoga.

## Din ke aakhir mein (day close)
**Payment** tab → **Day-close summary** → Print.
Isme milega: kitne bill bane, total sales, billing par cash/UPI, raat ki khata vasooli,
**total collection of the day**, naya udhaar, mode-wise paisa, saare bills, damage entries,
aur **reorder list** (kaunsa maal khatam hone wala hai).

## Maal aaya (purchase) — Stock
**Stock** tab → **Stock in** → item chuno → quantity → cost → Supplier ka naam → Save.
Stock badh jayega aur item ka average cost apne aap update ho jayega (profit report sahi aayegi).

Maal toota / expire / ghar gaya?
**Stock** tab → item ke saamne ⚙️ **Adjust** → jo actually count kiya wo likho → reason chuno → Save.

## Naya item / naya customer
* **Stock → New item** — naam, unit (pcs/kg/box), box mein kitne pcs, selling price, cost, low-stock alert.
* **Khata → New customer** — naam, phone (WhatsApp ke liye), area.
  Purana udhaar hai to **Opening balance** mein likho (udhaar = positive, aapko dena hai = minus).

## Kis-kis ka paisa baaki hai?
* **Khata** tab — sabse zyada udhaar upar.
* Kisi bhi customer par tap karo → **poora ledger** (har bill aur har payment) → **Statement** print ya WhatsApp **Reminder**.
* **Reports** tab → 0–15 / 16–30 / 31–60 / 60+ din ka hisaab — purani udhaari pakdo.

## Hafta mein ek baar (zaroor)
**Settings → Download full backup (JSON)** — file phone/PC/Google Drive mein rakh lo.
Kabhi kuch galat ho jaye to usi file se **Restore** kar sakte ho.

## Customer ko apna khata khud dikhao (Customer Portal)
Aap har customer ko ek **login** de sakte ho — wo apne phone se apna **balance, saare bill aur payment
history** dekh sakta hai. Baar-baar "kitna baaki hai?" ke phone kam ho jayenge.

**Login kaise banao:**
1. **Khata** tab → customer par tap karo → **Create login**.
2. Login ID (jaise `ramesh123`) aur password (app khud bana deta hai) → **Create login**.
3. **Send login details** dabao → WhatsApp khul jayega jisme link, ID aur password likha hua hai → Send.

Customer ko yahi message jayega:
```
🔗 https://aapki-website.github.io/#customer
👤 Login ID: ramesh123
🔑 Password: k7m3pq
```
Customer ye link kholke ID-password daalega aur apna poora hisaab dekh lega — **sirf apna, kisi doosre
ka nahi**. Wo apna **statement print/PDF** bhi kar sakta hai, aur **Message the shop** se aapko WhatsApp
bhi kar sakta hai.

**Dhyan rakho:**
* Ye portal **Firebase connect hone ke baad** hi asli surakshit hai (Settings → Setup guide).
  Local mode me wo sirf dikhawa hai.
* Customer ka password bhoole gaya? → Khata → customer → **Change password** → naya password bana kar bhej do.
* Kisi ka login band karna hai? → **Remove login**. Poora portal band karna hai? → **Settings → Customer portal** ka switch off kar do.

## Staff ka login banao (kaam baant do)
Aap har naukar/manager ko apna **alag login** de sakte ho — wo sirf utna hi kar payega jitna aap
**Staff** tab se allow karoge. Settings, staff aur data hamesha aapke paas rahega.

**Naya staff add karna:**
1. Side menu → **Staff** → **Add staff**.
2. Naam, email, password daalo (ya app ka banaya password rakh lo).
3. Role chuno — preset se permissions apne aap tick ho jayengi:

| Role | Wo kya kar sakta hai |
|---|---|
| **Manager** | Sab kuch, sirf settings aur staff login chhod ke |
| **Counter (billing + stock)** | Bill, payment, khata, stock — reports/profit nahi dikhega |
| **Cashier** | Bill, payment, khata (stock nahi) |
| **Store keeper** | Sirf stock aur khata |
| **Custom** | 12 permissions me se jo chahiye wo tick karo |

4. **Save**. Band karna ho to list me **ON/OFF** switch; hataana ho to **Remove**.

**Dhyan dene wali baatein:**
* Jo screen use allowed nahi, wo menu me hi nahi aayegi. Zabardasti kholne par **No access** likha
  aayega — data nahi dikhega.
* **Paise ka hisaab:** sales, jama, baki, profit, lagat (cost) aur stock ki value sirf aapko
  (ya jo login aapne allow kiya) dikhte hai. Cashier ko rate aur stock dikhega, profit nahi.
* Har bill me **kis ne banaya** likha aayega — bill ki line me, invoice me aur print me bhi.
* Staff ke galti se delete karne ka darr nahi: **Edit/Delete bill** alag permission hai, hata do to
  koi bill delete nahi kar payega.
* Firebase connect hone par ye rules **server par** bhi lagte hain — sirf app me dikhawa nahi hai.
* **Local mode** (Firebase ke bina) me password sirf usi computer par check hota hai — isliye
  **Staff → Owner login on this device** se owner password laga do, warna jis PC par app khula hai
  wo khud owner ban jayega. Asli suraksha ke liye Firebase connect karo.

## Chhote-chhote sawaal
* **Bill galat ban gaya?** → Bills tab → bill kholo → **Edit** (stock apne aap adjust ho jayega) ya **Delete** (stock wapas aa jayega).
* **Stock galat lag raha hai?** → Stock tab → **Recalculate** — movement history se stock dobara ban jayega.
* **GST nahi lagate?** → Settings → "Show GST / tax columns" hata do.
* **GST wale rate MRP jaise hain?** (rate mein tax included) → Settings → "My selling rates already include GST" tick karo.
* **Ghar par bhi chalana hai?** → dono jagah wahi Firebase login kar lo — data sync ho jayega.
* **Internet nahi hai?** → App phir bhi chalega (offline), internet aane par sab sync ho jayega.
* **Naya staff login?** → **Staff** tab → **Add staff** (role chuno, bas). Firebase walon ko
  `firestore.rules` Publish karna mat bhoolna — phir ye rules server par bhi lagenge.
* **Staff ka password bhool gaya?** → Staff → us par tap → **Send password reset** (uske email par link
  chala jayega). Local mode me wahi jagah naya password daal ke Save kar do.
* **Chhutti par gaya staff?** → Staff list me switch **OFF** kar do — login turant band.

**Aapki website:** https://noamzaki.github.io/noamzaki/

Poore technical steps **README.md** mein hain. Firebase ke steps **docs/FIREBASE-SETUP.md** mein hain.
Koi problem aaye to: **Settings** → Setup guide.
