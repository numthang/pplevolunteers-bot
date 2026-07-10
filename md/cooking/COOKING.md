# Cooking — ผู้ช่วยครัวส่วนตัว (personal app #1)

> Spec เคาะจาก grilling 2 รอบ (2026-07-09) — build session ยึดไฟล์นี้เป็นหลัก
> ⚠️ **แก้ใหญ่จากเวอร์ชันแรก:** เดิมวางเป็น "หน้าเดียว stateless สุ่มจบ" — **ผิด** user ไม่เคยอยาก stateless
> ของจริงคือ **ผู้ช่วยครัวที่จำ state ได้ แต่ยังจบใน 1 หน้า**

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
- #6 — `web/db/cooking/ingredients.js` + `GET/POST/DELETE /api/cooking/ingredients(/[id])` + `AddIngredientRow` + `×` ลบบน custom chip ใน `CookingClient.jsx` (dedup client-side + DB unique constraint กันซ้ำ 2 ชั้น) — เทสผ่าน browser จริง (puppeteer): add/dup(409)/bad-grp(400)/delete ครบ
  - `guessGroup()` เดา grp (protein/veg/special) จาก keyword ในชื่อตอนพิมพ์ — select ยังแก้ทับเองได้
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
