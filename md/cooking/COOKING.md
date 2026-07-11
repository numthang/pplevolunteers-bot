# Cooking — ผู้ช่วยครัวส่วนตัว (personal app #1)

> Spec เคาะจาก grilling 2 รอบ (2026-07-09) — build session ยึดไฟล์นี้เป็นหลัก
> ⚠️ **แก้ใหญ่จากเวอร์ชันแรก:** เดิมวางเป็น "หน้าเดียว stateless สุ่มจบ" — **ผิด** user ไม่เคยอยาก stateless
> ของจริงคือ **ผู้ช่วยครัวที่จำ state ได้ แต่ยังจบใน 1 หน้า**

## 🔄 v3 — public wiki + multi-kitchen (2026-07-11, เสร็จ+verify แล้ว)

**กลับคำจาก v2 อีกรอบ** (v2 เคยย้าย ingredient/menu ให้เป็นของ user คนเดียว) — user อยากให้:

1. **เมนู + ingredient checklist = public wiki เดียว** — ไม่มีเจ้าของ ใครก็เพิ่ม/แก้/ลบได้หมด ทุกคนเห็นชุดเดียวกัน (`cooking_menus`/`cooking_ingredients` เลิกเช็ค owner ใน WHERE clause ของ update/delete ทุกจุด, `cooking_ingredients` unique เปลี่ยนจาก `(owner,token)` เป็น `(token)` เดียว)
2. **pantry (มี/หมด) + history (ทำแล้ว/กันซ้ำ) แยกไปผูกกับ "ครัว" (kitchen) แทนคนคนเดียว** — หลายคนช่วยกันจัดการครัวเดียวกันได้ (เช่น Mean ช่วย Tee ซื้อของ/ติ๊กสถานะแทน) สมาชิกทุกคนสิทธิ์เท่ากันหมด ไม่มี role/tier
3. **`canonical.json` (44 รายการ static เดิม) ถูกลบทิ้งแล้ว** — DB (`cooking_ingredients`) เป็นแหล่งข้อมูลเดียว ไม่มี fallback คู่กันอีกต่อไป

### Data model ใหม่
- `cooking_kitchens` (id, name, owner=ผู้สร้างเฉยๆ) + `cooking_kitchen_members` (kitchen_id, member) — ผู้สร้างถูกใส่เป็นสมาชิกอัตโนมัติ, ทุก authorization check = "เป็นสมาชิกไหม" เท่านั้น
- `cooking_pantry`/`cooking_history` — คอลัมน์ `owner` ถูกตัดออกแล้ว เปลี่ยนเป็น `kitchen_id` (FK, NOT NULL) — **ไม่มี CASCADE** ตอนลบ kitchen (แต่ยังไม่มีฟีเจอร์ลบ kitchen เลยในแอพ ไม่กระทบ)
- Identity (`resolveOwner()` เดิม, `web/lib/cookingOwner.js`) ยังใช้อยู่ — แค่เพิ่มชั้น `web/lib/cookingKitchen.js` (`resolveKitchen()`) ครอบอีกที เพื่อ map identity → kitchen ปัจจุบัน (cookie `cooking_kitchen_id`, validate membership ทุกครั้ง ลอก pattern `web/lib/guildContext.js`) — auto สร้างครัวแรกให้ถ้ายังไม่เคยมีเลย (zero setup)

### หน้าใหม่ — `/cooking/kitchen`
สลับครัว (dropdown ในหน้าแรกก็สลับได้เร็วๆ ถ้ามี >1 ครัว) + เปลี่ยนชื่อครัว + เชิญสมาชิกแบบค้นชื่อ + ลบสมาชิก (กันลบคนสุดท้าย — ครัวต้องมี ≥1 คนเสมอ)

**อัปเดต (เดิมตั้งใจให้พิมพ์ Discord ID เอง กันผูกกับ org roster — user ขอเปลี่ยนเป็นค้นชื่อทีหลังในวันเดียวกัน):**
`GET /api/cooking/kitchens/member-search?q=` ค้น `dc_members` ตรงๆ (login อย่างเดียวพอ ไม่ต้องมี permission ระดับ docs เหมือน `/api/docs/members`) — คืน `discord_id`/`display_name`/`username` ให้ทำ autocomplete ใน `KitchenClient.jsx` (debounce 250ms) เลือกจาก dropdown แล้วยิง invite ด้วย `discord_id` จริง · ยังพิมพ์ Discord ID ตรงๆ เป็น fallback ได้ถ้าค้นไม่เจอ (คนที่ยังไม่เคย sync เข้า `dc_members`) — หมายเหตุ: จุดนี้ทำให้ cooking ผูกกับตาราง org (`dc_members`) แบบ read-only เพื่อความสะดวก ถือเป็น trade-off ที่ user เลือกเอง ไม่ใช่ business-logic coupling (แค่ lookup ชื่อ)

### 🔐 เพิ่มทีหลังในวันเดียวกัน — "public" ≠ "ใครก็ได้ในโลก"
เคาะเพิ่ม: ดูเมนู/ingredient ได้ทุกคนไม่ต้อง login (GET) แต่ **เขียน (POST/PATCH/DELETE) ต้อง login ด้วย Discord ก่อน** —
กันคนแปลกหน้าจากอินเทอร์เน็ต (ไม่มี Discord เลย) มาป่วน wiki เพราะ `/cooking` เข้าได้โดยไม่ต้อง login ตั้งแต่ v2
- Guard = เช็ค `isAnon` จาก `resolveOwner()` ใน 6 route: `POST/PATCH/DELETE` ของทั้ง `menus` และ `ingredients`
- pantry/cooked/kitchens **ไม่โดน guard นี้** — ยังใช้แบบไม่ต้อง login ได้ตามเดิม (ครัวส่วนตัวผ่าน anon cookie)
- **เจอ bug ระหว่างใส่ guard**: `removeCustomIngredient` ใน `CookingClient.jsx` ทำ optimistic UI (ลบออกจาก state ก่อนยิง DELETE) แล้ว `.catch(()=>{})` ทิ้ง response — ถ้า anon โดน 401 UI จะลบ chip ออกไปเฉยๆ ทั้งที่ server ไม่ได้ลบจริง (desync เงียบๆ) → แก้เป็นเช็ค `res.ok` ก่อนอัปเดต state เสมอ, เพิ่ม error surfacing ให้ `updateCustomIngredient`/`confirmBulkAdd` ด้วย (เดิมสองอันนี้ก็ swallow error เงียบๆ เหมือนกัน)

### ⚠️ Data hygiene ที่เจอหลัง migrate
เมื่อ ingredient กลายเป็น public ทุก session ที่เคย test (ของผมเองหลายรอบ + ของจริงที่ user พิมพ์) มารวมกันเป็นลิสต์เดียว — มีคำแปลกๆ/ทดสอบปนอยู่เยอะ (ดูตัวอย่างใน `.wolf/memory.md` ช่วงเวลานี้) ยังไม่ได้ล้าง เพราะแยกไม่ออกแน่ชัดว่าอันไหน test อันไหนจริง หลังรวมเป็น public แล้ว — ปล่อยให้ user ไล่ลบเองผ่าน UI (ลบได้ทุกอันแล้วตอนนี้) หรือรอสั่งให้ช่วยไล่ดู

## 🔄 v2 — กลับ decision เดิม (2026-07-10, Phase 0 เสร็จ+verify แล้ว)

User ขอต่อยอด → กลับ 3 ข้อจากสเปคเดิม:

1. **เมนูย้ายเข้า DB + มี owner** (เดิม = static JSON, CRUD = YAGNI) — ปลดล็อก เพิ่ม/แก้เมนู, import ด้วย AI, ดูเมนูคนอื่น
   - ตาราง `cooking_menus` (fields ตรงกับ seed + `image_url`) · seed 121 = `owner NULL` (ระบบ) · import ผู้ใช้ = `owner = uid`, `source='U'`
   - ทุกเมนู **public** — ไม่มี privacy (user เคาะ: ความเป็นส่วนตัวไม่แก้ pain แถมทำให้ซับซ้อน)
   - matcher ยัง deterministic เหมือนเดิม แค่โหลดเมนูจาก `/api/cooking/menus` แทน static import
   - loader: `scripts/cooking/seedMenus.js` (idempotent, refresh เฉพาะแถว `owner IS NULL`)
2. **เข้าใช้ได้โดยไม่ต้อง login** (เดิมบังคับ login Discord) — owner = anonymous cookie `cooking_uid` เป็น default, login เหลือเป็นตัวเลือกไว้ผูก state ถาวร/ข้ามเครื่อง
   - helper `web/lib/cookingOwner.js` → `resolveOwner()` (login → discordId, ไม่งั้น → anon uid, set cookie ตอนแรก)
   - owner column ขยาย `VARCHAR(20)→(64)` รองรับ `anon-<uuid>`
   - **ค้าง:** merge state anon → discord id ตอน login (Phase 1, ทำถ้าไม่ยุ่ง)
3. **รูปเมนู = อัปโหลด/วางลิงก์เอง** (ไม่ auto-fetch จากเน็ต — repo ไม่มี image-search API, เลี่ยง key/ลิขสิทธิ์) + export รายชื่อเมนูช่วยไปหารูป

Phase 2 (features) ยังไม่ทำ: #2 แยก 3 สี chip · #8 browse+slot animation · #3 CRUD form+รูป · #10 AI import · #9 gallery · #6 เพิ่ม ingredient เอง · #7 export

## 🎯 What / Why

แก้ pain: ทุกวันต้องนั่งนึก **"ทำอะไรให้ลูกกินดี"** (2 มื้อ/วัน) ทั้งที่ทำเป็นเยอะ

แต่ "สุ่มเมนูลอยๆ" = ไร้ประโยชน์ ถ้าไม่มีวัตถุดิบก็ทำไม่ได้ → **หัวใจคือแนะนำจากของที่มีจริง** + ครบมื้อ + ไม่ซ้ำซาก + เตือนของหมด

## 🖥️ หลักการ — หน้าเดียว จบ แต่ฉลาด

1. เปิดแอพ → เห็น **ของที่มีในครัว** (จำไว้แล้ว) ติ๊กเพิ่ม/เอาออกได้เร็วๆ
2. กด **"วันนี้กินอะไรดี"** → ระบบกรองเฉพาะเมนูที่**ทำได้จากของที่มี** แล้วเสนอ **1 ชุดมื้อครบหมู่**
3. ไม่ถูกใจ → **"เอาอันอื่น"** สุ่มใหม่จากที่ทำได้
4. **แชตปรับสด** ("ไม่มีหมู มีไก่", "ขอเมนูต้ม", "ลูกไม่กินเผ็ด")
5. ของหมด → แตะทีเดียว → เข้า **list ไปตลาด** อัตโนมัติ

สไตล์: **เรียบง่ายมาก** ไม่รก (user เกลียด UI แบบ Samsung Food)

## 🔁 Core loop (สำคัญสุด)

```
ของที่มี (DB, จำไว้)
      │  กรอง (deterministic, เร็ว, ฟรี)
      ▼
เมนูที่ทำได้  ──►  หัก score เมนูที่ซ้ำ 3 วันล่าสุด
      │
      ▼
เสนอ 1 "ชุดครบมื้อ"  =  จานหลัก (+ เติมผัก/แกงถ้าขาดหมู่)
      │
      ├─ ถูกใจ → ทำ → กด "ทำแล้ว" (ลง history กันซ้ำ)
      └─ แชตปรับ → AI ช่วย (เมนูที่ของขาดนิดเดียว/ปรับสูตร)
```

## 🍽️ กติกา "ครบมื้อ" (เคาะ ①)

- ทุกมื้อควรครบ **โปรตีน + ผัก + คาร์บ** — ยกเว้นได้แต่นานๆ ที (เฉพาะตอนของขาด)
- **คาร์บ = ข้าว/เส้น** ปกติเป็น staple ถือว่ามีตลอด → ไม่เสนอแยก
- จานหลักครบโปรตีน+ผักอยู่แล้ว → เสนอจานเดียวจบ
- จานหลักขาดผัก → เสนอ **+ ผักจานเล็ก/แกงจืด** จากผักที่มี ให้ครบ

## 🔀 กติกา "ไม่ซ้ำ" (เคาะ ②)

- จำ **history 3 วันล่าสุด** (~6 มื้อ)
- หัก score เมนูที่ **ซ้ำแกน** กับที่เพิ่งกิน — 3 แกน: **โปรตีน / วิธีทำ / สัญชาติ-รสชาติ**
- เกลี่ยให้หลากหลาย ไม่กินหมูทอด 3 มื้อติด

## 🧊 Pantry-lite — กันแอพตาย

หลุมที่ฆ่าแอพครัว = ต้องขยันอัปเดต stock ทุกครั้งที่ทำอาหาร → **เราไม่ทำแบบนั้น**

- วัตถุดิบมี state แค่ **มี / หมด** (binary ไม่นับจำนวน)
- **แตะเฉพาะตอนความจริงเปลี่ยน** (สังเกตว่าหมด) ไม่ใช่ตอนทำอาหาร
- **2 ชั้น:**
  - **ของติดครัว (staples)** — ข้าว/น้ำมัน/กระเทียม/หอม/น้ำปลา/ซีอิ๊ว/น้ำตาล/เกลือ/พริกไทย/ไข่ ฯลฯ → ถือว่ามีตลอด **ไม่ต้องติ๊ก** (หมดค่อยเอาออก)
  - **ของแปรผัน** — โปรตีน/ผักสด/ของเฉพาะเมนู → ติ๊กว่ามีวันนี้
- ของที่ตั้ง **"หมด" → list ไปตลาด** อัตโนมัติ · เลือกเมนูแล้วขาดของ → กดโยนเข้า list ได้
- **เติมของง่าย** — ช่องเพิ่มไว/ค้นหา, ติ๊กกลับเป็น "มี" หลังไปตลาด

## 🗃️ Data / DB

> ⚠️ **DB จริงคือ PostgreSQL** (`pg`, port 5432) — CLAUDE.md เขียน "MySQL" ตกหล่น อย่าเชื่อ · migration = `scripts/migration/migration.sql` (Postgres syntax: SERIAL, TIMESTAMPTZ, ON CONFLICT)

**แยก 2 อย่าง — static ไม่เข้า DB, mutable เข้า DB:**

- **เมนู + ลิสต์วัตถุดิบ = static JSON** `md/cooking/menus.seed.json` (121 เมนู เสร็จแล้ว) — 121 แถวนิ่ง query ไม่ได้ประโยชน์ แถม versioned/diff ง่าย → โหลดเข้า memory ตอนรัน, match แบบ **deterministic** เร็ว ฟรี ไม่พึ่ง AI
  - แต่ละเมนู: `{ id, name, food_groups[], protein[] (แทนกันได้), method, cuisine, flavor[], carb_in_dish, ingredients{core[],optional[]}, staples_used[], steps[], source(A/B), image{emoji,url}, gates{protein[],key[]} }`
  - **`gates` = ตัวใช้ match จริง** (ไม่ใช่ ingredients ดิบ 253 ตัว): `gates.protein` = โปรตีน enum · `gates.key` = ของเฉพาะที่เป็นตัวตัดสิน 0-3 ตัว (กะทิ/ชีส/ผงกะหรี่/ผักหวานป่า...) · ของโรย+ผักจิปาถะ+staples ไม่ gate
- **`md/cooking/canonical.json`** = checklist 44 ช่อง (protein 7 + veg 20 + special 17) แต่ละช่องมี `tier: regular`(ของประจำ) `/ occasional`(นานๆ ที) — tier 3 (staple) เพิ่มทีหลังได้
- **state ต่อผู้ใช้ = Postgres** `cooking_*` (ไม่มี FK ผูกตาราง org → bounded):

| ตาราง | ใช้ทำอะไร |
|---|---|
| `cooking_pantry` | (owner, ingredient) + status `have`/`out` — จำของในครัว · `out` = list ตลาด |
| `cooking_history` | owner + menu_id + cooked_at — กันซ้ำ 3 วัน |

- owner = **discord user id** (จาก next-auth) เก็บตั้งแต่แรก เผื่อ multi-user
- ingredient master (สำหรับ checklist) = derive จาก seed (รวม core+optional ทุกเมนู + ตั้ง staples)

## 🔐 Auth / Owner

- **login ด้วย Discord** — reuse next-auth ที่เว็บมีอยู่แล้ว ไม่สร้าง auth ใหม่
- เก็บ **discord id เป็น owner** ทุกแถว pantry/history → **รองรับหลายคนตั้งแต่แรก** (user ใช้คนเดียวตอนนี้ แต่เผื่อคนอื่น)
- migrate เป็น user_id กลางทีหลังตอนแยกระบบได้ (map ไม่ fuse)

## 🧠 AI / Backend

- **ลอก pattern ที่ repo มีอยู่:** `web/app/api/case/[ref]/letter/draft/route.js` = **raw `fetch` ไป `api.anthropic.com`** (ไม่ใช้ SDK) → ไม่ต้องลง dependency ใหม่
- key: `ANTHROPIC_API_KEY` (มีใน `.env` แล้ว), model **`claude-haiku-4-5-20251001`**
- AI ใช้ตอน: **แชตปรับสด** + เมนูที่ของขาดนิดเดียวแนะนำปรับ · การกรอง/สุ่ม/จับคู่ = ไม่ใช้ AI
- `web/app/api/cooking/` ถือ key ฝั่ง server
- ⚠️ ก่อน implement API route โหลด skill `claude-api`

## 📍 ที่อยู่

- `web/app/cooking/` + `web/app/api/cooking/` · URL `/cooking`
- **ไม่แยก repo** (additive, reuse Next+DB+auth+Claude ของเว็บ) · เขียน bounded โฟลเดอร์ตัวเอง ไม่ import business logic ของ org → ยกไป subdomain/repo ตัวเองทีหลังได้

## 🚫 ยังไม่ทำ (YAGNI)

- นับจำนวน stock / ปริมาณ (แค่ มี/หมด)
- วางแผนล่วงหน้าหลายวัน / ปฏิทินมื้อ
- แยก repo / subdomain / ชื่อ brand
- privacy/permission ระหว่างเมนูผู้ใช้ (เคาะแล้ว v2 — public หมด ไม่ต้องทำ)

## ✅ Decision ledger (เคาะแล้ว 2026-07-09 — ดู v2 ด้านบนสำหรับของที่กลับคำ)

1. กรองด้วยวัตถุดิบก่อน → สุ่มจากที่ทำได้ (random ลอยๆ = ตัดทิ้ง)
2. pre-generate ลิสต์วัตถุดิบทุกเมนู, match deterministic
3. staples 2 ชั้น — ของติดครัวถือว่ามีตลอด
4. **stateful** — จำ state ใน DB (แก้ความเข้าใจผิดเรื่อง stateless)
5. pantry แบบ มี/หมด, ของหมด = list ตลาด
6. variety — ไม่ซ้ำ 3 วัน, 3 แกน (โปรตีน/วิธีทำ/สัญชาติ)
7. ครบมื้อ — โปรตีน+ผัก+คาร์บ, จัดชุดให้
8. หน้าเดียวจบ (ยังจริง — คลังเมนู `/cooking/menus` เป็นหน้าย่อยแยกต่างหาก ไม่ใช่หน้าเมนหลัก)
9. ~~login Discord, เก็บ owner, เผื่อ multi-user~~ → **v2: ไม่บังคับ login** (ดูด้านบน)
10. ~~เมนู=static JSON~~ → **v2: เมนูอยู่ Postgres `cooking_menus`** · state ยังเป็น Postgres `cooking_pantry`+`cooking_history`+`cooking_ingredients` เหมือนเดิม, ไม่ FK org (DB จริงคือ **Postgres** ไม่ใช่ MySQL)

## 🗺️ Build map (v2 — อัปเดต 2026-07-10)

**เสร็จ + verify แล้ว:**
- Phase 0 — เมนู→DB (`cooking_menus`), owner widened VARCHAR(64), anon cookie login (`web/lib/cookingOwner.js`), de-login `page.js`, client โหลดเมนูจาก `/api/cooking/menus`
- #2 — สี pastel 3 สถานะ chip (`CookingClient.jsx`: `CHIP_HAVE` เขียวอ่อน, `CHIP_OUT` ชมพูอ่อน, `CHIP_NEUTRAL` เทาเส้นประ)
- #3 — เมนู CRUD: `web/lib/cookingMenu.js` (validator) + `web/db/cooking/menus.js` + `POST /api/cooking/menus` + `PATCH/DELETE /api/cooking/menus/[id]` (ownership guard, seed แก้ไม่ได้) + `web/app/cooking/MenuForm.jsx` (modal เพิ่ม/แก้ — เตือนถ้า gates ว่าง)
- #7 + #9 — `web/app/cooking/menus/page.js` + `MenusClient.jsx` = คลังเมนูรวม (ทุกเมนู public, ป้าย by=ระบบ/ฉัน/สมาชิก) + ปุ่มคัดลอกรายชื่อ
- #10 — `web/app/api/cooking/import/route.js` (Haiku raw fetch, บังคับ gates.protein เป็น enum + gates.key) + ปุ่ม "✨ AI ช่วยสร้าง" ใน MenusClient → เปิด MenuForm พร้อมข้อมูลให้รีวิวก่อน save

**เสร็จ + verify แล้ว (2026-07-10):**
- #6 — `web/db/cooking/ingredients.js` + `GET/POST/PATCH/DELETE /api/cooking/ingredients(/[id])` + `AddIngredientRow` + `✎` แก้ไข/`×` ลบบน custom chip ใน `CookingClient.jsx` (dedup client-side + DB unique constraint กันซ้ำ 2 ชั้น) — เทสผ่าน browser จริง (puppeteer): add/dup(409)/bad-grp(400)/edit/delete ครบ
  - `guessGroup()` เดา grp จาก keyword ในชื่อตอนพิมพ์ — select ยังแก้ทับเองได้
  - แก้ไข (`updateIngredient`) เปลี่ยนได้แค่ label/grp — **token คงเดิมเสมอ** เพราะ `cooking_pantry` ผูก status ด้วย token ไม่ใช่ id (เปลี่ยน token = pantry status เดิมหลุด)
  - **หมวด ingredient เคาะใหม่ 2026-07-10 — เลิก "ของเฉพาะ" ถังรวม เหลือ 5 หมวดตาม taxonomy ที่ user กำหนด:**
    `protein`(เนื้อสัตว์/อาหารทะเล/ไข่/เต้าหู้/ถั่วโปรตีน) · `veg`(ผักสด/ผลไม้/เห็ด) · `starch`(แป้ง/ธัญพืช/เส้น/ข้าว) · `dairy`(นม/ชีส/เนย/ครีม) · `seasoning`(เครื่องปรุง/ซอส/สมุนไพร/ผักสวนครัวอย่างหอมใหญ่)
    → `canonical.json` จัดใหม่ตามนี้ + migration แก้ CHECK constraint บน `cooking_ingredients` (`scripts/migration/migration.sql` บล็อกวันที่ 2026-07-10 — ต้อง DROP constraint ก่อน UPDATE ค่าใหม่เสมอ ไม่งั้นชน CHECK เดิม) + reclassify แถวเก่าที่เคย migrate เป็น `special` ให้ตรงหมวดใหม่ (รันแล้วบน dev DB)
    ทุกจุดที่ hardcode 3 ตัวเลือกเดิม (select ×3, ChipGroup ×3, GROUPS validation ×3 API route, AI bulk-import system prompt) เปลี่ยนเป็นอ่านจาก `GROUP_OPTIONS` constant ตัวเดียวหรือ 5 ค่าใหม่แล้วทั้งหมด
  - เพิ่มแบบ bulk: พิมพ์คั่นด้วย `,` → `POST /api/cooking/ingredients/bulk` (Haiku แก้คำผิดไทย + จัดหมวดให้) → รีวิว/แก้ทีละแถวก่อนกด "เพิ่มทั้งหมด"
  - **ลบ custom ingredient ที่ถูกใช้เป็น `gates.key` ของเมนู** → เตือนก่อนลบ (`window.confirm`, list ชื่อเมนูที่กระทบ) เพราะ `gates.key` ผูกด้วย token string ตรงๆ ไม่ใช่ FK — ลบแล้วเมนูนั้นจะทำได้ไม่ได้อีกเลยแบบเงียบๆ จนกว่าจะเพิ่ม token เดิมกลับมา หรือแก้ gates ของเมนูเอง (ยังไม่มี UI เตือนตอนแก้เมนูโดยตรง เผื่อทำทีหลัง)
  - `CartIcon` (inline SVG, `currentColor`) แทน emoji 🛒 ทั้ง 3 จุด (chip "หมด", hint text, หัวข้อ "ไปตลาด") — emoji เป็น full-color glyph ของ OS แก้สีผ่าน CSS ไม่ได้ ใช้ currentColor ให้เข้ากับสีข้อความรอบๆ เองแทน
  - **แก้ bug `findDuplicate()` เช็ค substring/containment เข้มเกินไป** — คำไทยผสมคำกันปกติ (เช่น "ไข่ไก่" contains "ไก่", "ไข่เค็ม" contains "ไข่") ทำให้เพิ่ม "ไข่ไก่"/"ไข่" ไม่ได้เพราะโดนตีว่าซ้ำกับ "ไก่"/"ไข่เค็ม" ที่มีอยู่แล้ว → ตัด containment check ออก เหลือแค่ exact match (normalize case/space) เท่านั้น
- #8 — slot-machine reel ใน `runSuggest` (ref + interval 80ms/900ms, cleanup on unmount, reduced-motion skip) — เทสผ่าน browser จริง เห็น reel หมุนแล้ว reveal การ์ดปกติ
- หัวข้อ = `{{display_name}}, วันนี้ทำอะไรกินดี?` (nickname จาก session ผ่าน `page.js`, anon ไม่มี prefix) · ปุ่ม CTA ใช้สี custom จาก palette ที่ user ส่งมา (`#E57A72` สุ่ม, `#C1F0B4` ทำแล้ว) แทน `bg-teal` เดิม (สดไป) · "ของในครัว" เปิดโดย default เหมือนเดิม, **"วิธีทำ" ในการ์ดผลลัพธ์ปิดโดย default** (`<details>`, กดหัวข้อเพื่อดู)
- หน้าแรก `/cooking` เพิ่มลิงก์ "คลังเมนู →" ไปหน้า `/cooking/menus` (เดิมไม่มีทางเข้าเลยนอกจากพิมพ์ URL เอง)
- **44 รายการ checklist ย้ายจาก static `canonical.json` เข้า `cooking_ingredients` เป็นของ user คนเดียว** (`scripts/cooking/migrateCanonicalToOwn.js`, idempotent, owner default = `DEV_DISCORD_IDS` ตัวแรก) — เคาะแล้ว 2026-07-10 (กลับคำจาก v2 เดิมที่บอก "เมนู+ingredient list = static") เพราะ user อยากแก้ไข/เพิ่มเองได้ทั้งหมดโดยไม่ต้องแก้โค้ด
  - `byGroup()` ใน `CookingClient.jsx` กันโชว์ซ้ำ: ถ้า token มีใน `cooking_ingredients` ของ owner แล้ว ใช้แถว DB แทน static (static ยังเป็น fallback ให้ owner ใหม่ที่ยังไม่ได้ migrate — เผื่อ multi-user ในอนาคต ต้องรัน migrate script ให้แต่ละคนเอง หรือเขียน auto-seed ตอน user ใหม่ตอน onboarding — ยังไม่ทำ)
- **121 เมนู seed (`owner NULL`) โอนเป็นของ user คนเดียวทั้งหมด** (`scripts/cooking/migrateMenusToOwn.js`) — เหตุผลเดียวกับ ingredients: อยากแก้/ลบเมนูเก่าได้ผ่านปุ่มแก้ไข (เดิม `updateMenu`/`deleteMenu` เช็ค `WHERE owner=$` ซึ่งไม่ match NULL ได้เลย) — **cooking_menus ไม่มีแถว `owner IS NULL` เหลือแล้ว** (0 seed) → `seedMenus.js` รันซ้ำจะไม่ update อะไรอีก (WHERE owner IS NULL ไม่ match ใครแล้ว), เมนูทั้งหมดขึ้นป้าย "ฉัน" แทน "ระบบ"

**ยังไม่ทำ:**

### #6 — เพิ่ม ingredient เอง + เช็คซ้ำ/คำใกล้เคียง (เสร็จแล้ว — เก็บ spec ไว้อ้างอิง)
- DB: table `cooking_ingredients` **มีอยู่แล้ว** (migration รันแล้ว) — `owner VARCHAR(64), token VARCHAR(80), label VARCHAR(80), grp('protein'|'veg'|'special'), tier DEFAULT 'regular'`, unique `(owner, token)`
- สร้าง `web/db/cooking/ingredients.js`: `getIngredients(owner)` (`SELECT ... WHERE owner=$1 ORDER BY id`), `addIngredient(owner, {token,label,grp,tier='regular'})` (`INSERT ... ON CONFLICT (owner,token) DO NOTHING RETURNING ...` คืน null ถ้าซ้ำ)
- สร้าง `web/app/api/cooking/ingredients/route.js`: `GET` → resolveOwner → list · `POST` validate `token`/`label` ไม่ว่าง + `grp` ∈ 3 ค่า (ไม่งั้น 400) → addIngredient
- ใน `CookingClient.jsx`: state `customIngredients`, โหลดพร้อม pantry ตอน mount (เพิ่ม fetch ที่ 3 ใน `Promise.all`), merge เข้าแต่ละ `ChipGroup` (`[...canonicalData.X, ...customIngredients.filter(i=>i.grp==='X')]`), extend `allCanonical` ให้ `labelFor` เจอ token ใหม่ด้วย
- UI เพิ่มแถวท้าย `<details>` "ของในครัว": input ชื่อ + select กลุ่ม (default `special`) + ปุ่ม "เพิ่ม"
- **Dedup client-side ก่อนยิง API**: normalize = `s.trim().toLowerCase().replace(/\s+/g,'')` เทียบกับทุก token+label ที่มีอยู่ (canonical + custom) — ถือว่าซ้ำถ้า equal หรือ (ยาว≥2 ทั้งคู่ และ substring กันได้) → ถ้าซ้ำ **ไม่ยิง API** โชว์ "มีอยู่แล้ว: {label ที่ match}" · ถ้าไม่ซ้ำค่อย POST แล้วต่อ chip ใหม่เข้า state ทันที (`token=label=ชื่อที่พิมพ์` — เป็น Thai name ตรงกับ `gates.key` ของเมนู import ได้เลย)

### #8 — Slot-machine animation ตอนสุ่ม (เสร็จแล้ว — เก็บ spec ไว้อ้างอิง)
- state ใหม่: `spinning`, `reel` ({name,emoji})
- ใน `runSuggest`: คำนวณผล `r` จริงเหมือนเดิมก่อน (ห้ามเปลี่ยน logic) → ถ้า `r` ไม่ empty และ `!window.matchMedia('(prefers-reduced-motion: reduce)').matches` → `setSpinning(true)`, `setInterval` ~80ms สุ่ม `reel` จาก `makeableMenus(menus, haveSet)` (import จาก `@/lib/cookingMatch.js`, fallback `menus` ถ้าพูลว่าง) ~900ms แล้ว clear interval, `setReel(null)`, `setSpinning(false)` — ใช้ ref เก็บ interval id + cleanup ตอน unmount กัน leak
- ถ้า reduced-motion → ข้าม reel เผยผลทันที (พฤติกรรมเดิม)
- Render: ตอน `spinning=true` โชว์แค่ emoji+ชื่อจาก `reel` ใหญ่ๆ (animate เบาๆ แบบ transform/opacity เท่านั้น กัน layout thrash) ซ่อนเครื่องปรุง/วิธีทำ/ปุ่ม/แชทไว้ก่อน พอ `spinning=false` ค่อยโชว์การ์ดเดิมทั้งหมด

### Phase 1 (แยกทำทีหลัง, ไม่ block อะไร) — merge anon → login
- ตอน login สำเร็จ (next-auth callback หรือหน้า cooking เช็คตอน mount) — อ่าน `readAnonUid()` จาก `web/lib/cookingOwner.js` ถ้ามี cookie anon เดิม → `UPDATE cooking_pantry/cooking_history/cooking_menus SET owner=$discordId WHERE owner=$anonUid` แล้วลบ cookie · ทำเป็น task แยก ถ้าเริ่มยุ่งให้หยุด (ตามที่ user สั่งไว้)
