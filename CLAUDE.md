# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# pple-volunteers — Global Documentation

Quick navigation to detailed docs for the entire pple-volunteers project (Bot + Web).

## 🚀 Quick Links

| Topic | File |
|---|---|
| **Discord Bot** | [md/discord/BOT.md](md/discord/BOT.md) |
| **Web App (Next.js)** | [md/WEB.md](md/WEB.md) |
| **Finance System** | [md/finance/FINANCE.md](md/finance/FINANCE.md) |
| **Calling System** | [md/calling/CALLING.md](md/calling/CALLING.md) |
| **Contacts (CRM)** | [md/calling/CONTACT.md](md/calling/CONTACT.md) |
| **Auth & Identity** | [md/org/AUTH.md](md/org/AUTH.md) |
| **Database Schema** | [md/DATABASE.md](md/DATABASE.md) |
| **Production Deployment** | [md/DEPLOYMENT.md](md/DEPLOYMENT.md) |
| **Cutover org-core→master** | [md/archive/CUTOVER.md](md/archive/CUTOVER.md) |
| **Case System** | [md/case/CASE.md](md/case/CASE.md) |
| **Kanban (การบ้าน)** | [md/kanban/KANBAN.md](md/kanban/KANBAN.md) |
| **Server Wizard** | [md/discord/SERVER_WIZARD.md](md/discord/SERVER_WIZARD.md) |
| **RAG AI** | [md/discord/RAG.md](md/discord/RAG.md) |

---

## 📦 Project Overview

- **Bot:** Node.js + discord.js v14 — root directory
- **Web:** Node.js + Next.js (App Router) — `/web/`
- **Database:** PostgreSQL `pple_volunteers` (host: localhost, port 5432, user: pple_dcbot)
- **Auth:** Discord OAuth via next-auth
- **Search:** Meilisearch (binary: `/usr/local/bin/meilisearch`, data: `data.ms/`)

---

## 🔑 Key Conventions

- Git branch: `master` (production), local: `main` for PRs
- **คำสั่งบน production ต้องห่อด้วย `bash -c` เสมอ** — `sudo -u www bash -c "…"`
  (ไม่ใช่แค่ `sudo -u www …` เฉยๆ · ดู §Production ข้างล่าง — ไม่ห่อ = โดนถามรหัสผ่านแล้วตาย)
- Database: Every table has `guild_id` (VARCHAR 20) for multi-server support
- Discord.js: Use `MessageFlags.Ephemeral` not `{ ephemeral: true }`
- Code: runnable, copy-paste friendly, no over-engineering

---

## 📂 Directory Structure

```
pple-volunteers/
  index.js                 ← Bot entry point
  deploy-commands.js
  deploy.sh
  commands/                slash commands
  handlers/                interaction handlers
  components/              embed builders
  db/                      database functions
  config/                  constants, roles
  utils/                   activity tracker
  services/                external services
  scripts/                 one-off scripts
  logs/                    log files
  md/                      documentation
  web/                     Next.js app
    app/                   App Router
    components/            React components
    db/                    database functions
    lib/                   auth, roles, helpers
```

---

## 🎨 Brand Colors

| Token | Hex | ใช้งาน |
|---|---|---|
| `orange` | `#ff6a13` | Primary / CTA |
| `orange-light` | `#f37a2c` | Hover / Secondary orange |
| `navy` | `#002b49` | Background dark / Hero |
| `red-accent` | `#df492e` | Accent / Danger |
| `blue-light` | `#b5d1dc` | Muted / Border / Subtle |
| `white` | `#ffffff` | — |
| `black` | `#000000` | — |

---

## ℹ️ Preferences

- Confirm Q&A before writing code
- Ask directly (casual is fine)
- Code must be runnable / copy-paste friendly
- No over-engineering
- **ก่อน implement ฟีเจอร์ใหม่หรือ refactor ทุกครั้ง — ให้รัน `/scrutinize` ก่อนเสมอ** อย่าลงมือเขียน code จนกว่าจะผ่านขั้นตอนนี้
- **คำถามเชิงประเมิน = ตอบก่อน ห้ามลงมือ** (user ทักซ้ำ 4 รอบ ล่าสุด 2026-09-05):
  "จะช่วยไหม · คุ้มไหม · ควรทำไหม · ดีกว่าไหม · ทำไงอ่ะ · ทำไม/อะไร/ตรงไหน"
  → วัด/วิเคราะห์ได้ (อ่านอย่างเดียว) แล้วตอบพร้อม**ตัวเลขและข้อแลกเปลี่ยน** จบด้วย "ทำเลยไหม"
  · ลงมือได้ต่อเมื่อได้กริยาสั่ง ("ทำเลย/แก้ให้ที/เอาแบบนั้น") · "อาจจะ/ก็ได้/น่าจะ" ไม่ใช่การเคาะ

## 💾 กฎการบันทึก — Create vs Update (เคาะ 2026-07-30 · ใช้กับทุกฟอร์มทั้งโปรเจกต์)

| หน้า | พฤติกรรม |
|---|---|
| **Create** (สร้างใหม่) | **มีปุ่ม "บันทึก" เสมอ · ห้าม autosave · ห้ามสร้างแถวใน DB จนกว่าจะกดบันทึก** |
| **Update** (แก้ของเดิม) | **มี autosave = ห้ามมีปุ่ม "บันทึก"** (แก้กฎ 2026-07-30 เย็น) · ต้องมี **ป้ายบอกสถานะ** "กำลังบันทึก…/บันทึกแล้ว" แทน + `beforeunload` เตือนถ้าปิดแท็บตอนยังเซฟไม่เสร็จ · หน้า Update ที่ **ไม่มี** autosave ยังต้องมีปุ่มบันทึกตามเดิม |

- **ห้ามยิง POST สร้าง record ตอนกดปุ่ม "เพิ่ม/สร้างใหม่"** — เคสจริงที่ทำผิด: `/posts` กด "เขียนโพสต์ใหม่" แล้ว POST ทันที กดเล่น 5 ครั้ง = ร่างเปล่า 5 แถวค้าง DB (user บ่น 2026-07-30)
- หน้า Create ที่ไม่มี autosave **ต้องมี `beforeunload` เตือนเมื่อมีข้อความค้าง** ไม่งั้นแลกปัญหาเก่ากับงานหาย
- **เดิมบังคับให้หน้า Update มีปุ่มบันทึกควบคู่ autosave — ยกเลิกแล้ว 2026-07-30 เย็น** (user เคาะ: autosave ทำงานอยู่แล้ว ปุ่มซ้ำซ้อน + แถวปุ่มแตกบนมือถือ) · ที่ต้องมีแทนคือ **ป้ายสถานะการเซฟ + `beforeunload` ตอนยังเซฟไม่เสร็จ** — ห้ามเอาปุ่มออกเฉยๆ โดยไม่มี 2 อย่างนี้

## 📖 Required Reading Before Coding

**ทุกครั้งก่อนเขียนหรือแก้ code ใน `web/` ต้องอ่านก่อนเสมอ:**
1. `md/WEB.md` — CSS conventions, dark mode classes, component patterns
2. ไฟล์ sibling ในโฟลเดอร์เดียวกัน — เพื่อ match pattern ที่ใช้จริง

**⚠️ สร้าง component ใหม่ใน `web/` — ห้าม write โดยไม่อ่าน sibling ก่อน:**
- อ่านไฟล์อื่นในโฟลเดอร์เดียวกันอย่างน้อย 1 ไฟล์เพื่อ copy CSS class pattern ที่ถูกต้อง
- dark mode ต้องใช้ `dark:text-disc-text`, `dark:border-disc-border`, `dark:text-disc-muted`, `bg-card-bg` เท่านั้น — ห้ามใช้ `dark:bg-warm-dark-*` หรือ `dark:text-warm-*`

**ถ้าแก้ไฟล์ที่มี stats/query — ต้องอ่าน query เทียบกับ tab/type อื่นด้วยว่า return field ครบไหม**

**📱 แก้/สร้าง UI ใน `web/` เสร็จ — ต้องรัน mobile audit ก่อนบอกว่าเสร็จ (เพิ่ม 2026-08-31):**
```bash
node scripts/dev/mobileAudit.mjs --routes /หน้าที่แก้     # exit 1 = ยังล้น ห้ามปิดงาน
```
user ทัก: "ผมต้องมาเจอเองแล้วต้องบอกให้คุณไล่แก้หมดเลย เหนื่อยอ่ะ" — งานหา "จุดไหนล้น" เป็นของเครื่อง ไม่ใช่ของ user
กฎ layout มือถือทั้งชุดอยู่ `md/WEB.md §จอมือถือ` (อ่านก่อนแก้ ไม่ใช่หลังโดนทัก)

## ⚡ Token / Model — Claude บริหารเอง (user ไม่ต้องสั่ง)

User มักอยู่ model แพง (Opus/Fable) และ**ไม่อยากสลับ /model เอง** — หน้าที่ Claude คือบริหาร token ให้อัตโนมัติทุก session โดยไม่ต้องรอ user สั่ง (user เคาะแล้ว 2026-07-09):

- **งาน mechanical ก้อนใหญ่** (migrate string i18n, refactor ตาม pattern เดิม, งานซ้ำหลายไฟล์) → **spawn subagent `model: sonnet` เอง** แล้วบอก user สั้นๆ ว่ากำลังส่งให้ subagent
- **ซอยเป็นก้อนเล็ก 2-3 ไฟล์ต่อ subagent** อย่าโยนทั้งโซนรวดเดียว (เคยชนเพดานโควต้า account 2026-07-09 — Sonnet ก็ดึงจากโควต้าเดียวกัน จึงประหยัด "ต่อ token" ไม่ใช่ "ไม่จำกัด")
- **งานคิด / ออกแบบ / ตรวจงาน subagent / debug** → ทำใน main thread เอง
- user เปลี่ยนเรื่องคุย → แนะนำ `/clear` · session ยาวมาก → เตือนว่า context เริ่มแพง ควรปิดจบเป็นเรื่องๆ
- ถ้า Claude ลืม/พลาด — user นัดไว้ว่าจะพิมพ์คำเดียว "sonnet" เป็นสัญญาณเตือน

### 🧭 SOP: triage งานก่อนลงมือ (เคาะ 2026-07-14 — มาตรฐานถาวร)

Opus (main thread) เป็นหัวหน้างาน — รับงานแล้ว **ตัดสิน tier ด้วย rubric นี้เองใน 1 จังหวะ (inline, ไม่ต้อง spawn "scope agent" — cold-start เปลืองเปล่า):**

| ชนิดงาน | ใคร | หมายเหตุ |
|---|---|---|
| คิด / ออกแบบ / กำกวม / debug / ตรวจงาน subagent / คุยกับ user | **Opus (main)** | หัวใจอยู่ที่นี่ ทำให้กระชับ |
| mechanical มี pattern ชัด 2-3 ไฟล์ | **Sonnet subagent** | spec เป๊ะให้จบรอบเดียว |
| trivial ซ้ำๆ หลายไฟล์ (rename/ย้าย/ลอก pattern เดิม/boilerplate) | **Haiku subagent** | ถูกสุด ($1/$5 ≈ ถูกกว่า Opus 5×) แต่ต้อง spec เป๊ะสุด + Opus ตรวจผลเสมอ |
| ใหญ่ + อิสระต่อกัน | **หลาย Sonnet ขนาน แบ่งตามไฟล์** | ห้ามให้ 2 agent แตะไฟล์เดียวกัน (แบบ A/B1/B2) |

**กติกาคู่กัน:**
- **Commit checkpoint ก่อนปล่อย agent รื้อหนัก** — bad run ย้อนได้ ไม่ต้องทำใหม่ (ประหยัด redo tokens) · [[feedback_flag_before_crossing_boundary]]
- **เพดานล่าง — เมื่อไหร่ห้าม spawn (เพิ่ม 2026-08-31):** subagent เริ่มจาก context ศูนย์ ต้องไล่อ่านไฟล์ใหม่ทั้งหมด ไม่ฟรี · **ถ้า spec ที่ต้องเขียนยาวกว่า diff ที่จะได้ = ทำเองใน main thread** · งานที่ Opus อ่านไฟล์ไปแล้วใน session นี้ ส่งออกไปแพงกว่าทำเอง — cold-start กินหมด
- **Verify แบบถูก — เครื่องตรวจก่อนสายตา (ย้ำ 2026-08-31):** `npm run build` + `cd web && npm test` + curl ให้ผ่านก่อน แล้ว Opus ค่อยอ่าน**เฉพาะจุด logic เสี่ยง** · **ห้ามตรวจด้วยการอ่าน diff ทั้งก้อน** — ต้นทุนหลักคือการอ่าน ไม่ใช่การเขียน ตรวจแบบนั้น = จ่าย Opus เท่าทำเองตั้งแต่แรก เงินที่ประหยัดจากการ delegate หายหมดตอนตรวจ
- **spec เป๊ะ = ตัวประหยัดจริง** (agent flail = เผา token · เดาผิดแล้ว Opus ต้องรื้อ = จ่าย 2 รอบ แพงกว่าทำเอง) → **ส่งเฉพาะงานที่ spec ได้เป๊ะ** ไม่ใช่ "ส่งให้ Sonnet ให้มากที่สุด" · ตัวประหยัดหลัก = tier model ลงตามงาน ไม่ใช่ซ้อน agent เยอะๆ
- **/clear ตอนเปลี่ยนเรื่อง ประหยัดกว่าสลับ tier:** ประวัติทั้ง session ถูกส่งซ้ำทุก turn (cache ทำให้ถูกลง แต่ไม่ฟรี และโตเรื่อยๆ) · session ที่ปนหลายเรื่องแพงกว่าเลือก model ผิดอีก

### 🧹 /clear เมื่อไหร่ — ตัดสินจาก "เขียนลงกระดาษหรือยัง" ไม่ใช่ "งานเสร็จหรือยัง" (เคาะ 2026-08-31)

user สับสนว่า "ฟีเจอร์เดิมยังแก้ไม่จบ แถมมีบั๊ก แล้วจะเคลียร์ได้ไง" — **premise ผิด: สิ่งที่ต้องข้าม session ไม่ใช่บทสนทนา แต่คือ `git commit` + `.wolf/STATUS.md`** งานยังไม่เสร็จ ≠ ห้ามเคลียร์

- **เกณฑ์เดียว:** session ใหม่อ่าน STATUS.md แล้วทำต่อได้เองโดยไม่ต้องถามอะไร → **เคลียร์ได้เลย** · ถ้ายังไม่ได้ = ไม่ใช่เหตุให้ทนคุยต่อ แต่แปลว่า handoff ยังไม่เสร็จ → `/handoff` ก่อน แล้วค่อยเคลียร์
- **แก้บั๊กเดิมรอบที่ 3 แล้วยังไม่หาย = สัญญาณให้เคลียร์ ไม่ใช่สัญญาณให้คุยต่อ** — context ที่สะสมความพยายามที่ล้มเหลวไว้ ทำให้ Claude patch ตามอาการต่อจากรอยเดิม แทนที่จะถอยมาหาเหตุ · เคลียร์ + เขียนอาการลง STATUS + เริ่มจาก reproduce ใหม่ มักจบเร็วกว่า · ตรงกับ [[feedback_model_workflow]] "เข้ากลางงานให้ถอยมองภาพรวม อย่า patch ต่อ"
- **ห้ามเคลียร์ตอน:** กำลัง trace อยู่กลางทาง ยังไม่ commit และยังไม่ได้เขียนอะไรลง STATUS — นั่นคือจังหวะเดียวที่บทสนทนามีของที่กระดาษยังไม่มี
- **commit บ่อย = ทำให้เคลียร์ถูก** — พอ commit แล้ว diff คือความจำ · `git log` + STATUS = สถานะเริ่มใหม่ ไม่ต้องพึ่งประวัติแชต

**❌ อย่าหลงทำ (cargo-cult — ประเมินแล้วไม่คุ้ม/ไม่มีจริง 2026-07-14):**
- อย่าเรียก **Fable มาออกแบบ** — แพงกว่า Opus 2× ($10/$50) · คุ้มเฉพาะที่ Opus คิดไม่ออกจริงๆ
- ไม่มีโหมด **"deep learner"** ใน Claude Code (จำชื่อผิด)
- อย่า **"test 100 cases ด้วย Haiku"** ถ้าไม่มี test harness · test ต้องแมตช์งาน: logic → jest จริง, UI → กดจริงในเบราว์เซอร์
- **Codex (OpenAI) ไม่ได้ต่อไว้** — อยากได้ second-model review ใช้ `/code-review` (Claude) แทน

## 🌍 i18n — โค้ดใหม่ห้าม hardcode ข้อความ

รางวางแล้ว (2026-07-09) — **string ที่ user เห็น ในโค้ดใหม่ทุกไฟล์ต้องผ่าน t() เสมอ** (ไฟล์เก่าที่แก้เล็กน้อยยังไม่บังคับ — จะทยอย migrate เป็นโซน):

- **เว็บ:** key ลง `web/locales/th.json` (+ `en.json`) · client: `useTranslations('ns')` · server: `await getTranslations('ns')` จาก `next-intl/server`
- **Bot:** key ลง `locales/th.json` (+ `en.json`) · `const t = await getT(guildId)` จาก `services/i18n.js` → `t('ns.key', { vars })`
- Key naming: `<โมดูล>.<จุดใช้>` เช่น `calling.logForm.saveButton` · ใช้ interpolation `{name}` ไม่ต่อ string เอง
- locale ต่อ guild: `dc_guild_config` key `locale` (ไม่มี = `th`)

**เส้นแบ่ง "ไฟล์เก่า" vs "โค้ดใหม่" — ห้ามตีความเอง (เคาะ 2026-07-30 หลังพลาดที่ `PostsHome.jsx`):**
> แก้ไฟล์เดิมแล้ว **เพิ่ม/เปลี่ยนข้อความที่ผู้ใช้เห็นตั้งแต่ 3 ประโยคขึ้นไป** หรือ **รื้อ block render ใหม่ทั้งก้อน** = นับเป็นโค้ดใหม่ → ต้อง migrate ทั้งไฟล์เป็น `t()` ในรอบเดียวกัน
>
> ต่ำกว่านั้นถึงจะเข้าข่าย "แก้เล็กน้อย" ที่ยกเว้นได้ · ถ้าเลี่ยงเพราะทั้งโซนยังไม่ migrate — **ต้องจดลง `md/PENDING.md` ทันที** ไม่ใช่ปล่อยผ่านเงียบๆ

## 🚀 Production — วิธีสั่งงานที่ผ่านจริง (เคาะ 2026-09-04 หลังเสีย session ไปทั้ง session)

`ssh tee@202.183.141.78` · โปรเจกต์อยู่ `/www/wwwroot/pple-volunteers` · **เข้าได้จริง อย่าอ้างว่าเข้าไม่ได้**

### กฎเหล็ก: หลัง `sudo -u www` ต้องเป็นคำว่า `bash` เสมอ

sudoers บนเครื่องเปิดไว้แค่ `(www) NOPASSWD: /bin/bash` — binary อื่นตกไปเข้ากฎ `(ALL:ALL) ALL`
ที่ขอรหัสผ่าน ซึ่ง session ไม่มีและถามใครไม่ได้ → ตายตรงนั้น

```bash
# ✅ ถูก — binary คือ /bin/bash
sudo -u www bash -c "cd /www/wwwroot/pple-volunteers && npm run migrate up"
sudo -u www bash -c "pm2 restart pple-web pple-dcbot --update-env"
sudo -u www bash -c "pm2 logs pple-dcbot --lines 30 --nostream"

# ❌ ผิด — ถามรหัสผ่านแล้วตาย
sudo -u www pm2 restart pple-dcbot
sudo -u www grep foo bar.txt
```

**⚠️ ห้ามแก้ด้วยการตัด `sudo` ทิ้ง** — `pm2 list` ในนาม `tee` ตอบ "Process not found" ทั้งที่แอปรันอยู่
(pm2 แยก daemon ต่อ user · แอปอยู่ใต้ `www`) · **ไม่ถามรหัส ≠ ทำงานถูก** เคสนี้เงียบกว่าเดิมอีก

### deploy เต็มชุด

```bash
sudo -u www bash -c "cd /www/wwwroot/pple-volunteers && git pull origin master && npm run migrate up"
sudo -u www bash -c "cd /www/wwwroot/pple-volunteers/web && npm run build"
sudo -u www bash -c "pm2 restart pple-web pple-dcbot --update-env"
```

### ⛔ แก้ข้อมูล DB บน prod — มีทางเดียว

**เขียนเป็นไฟล์ใน `migrations/` → commit → pull → `npm run migrate up`**

ทางอื่นตันหมด อย่าเสียเวลาลองแล้วไปบอก user ว่า "รันให้ไม่ได้":
- **`psql` ใช้ไม่ได้** — ต้องอ่านไฟล์ตั้งค่าลับก่อน = ชน hook `.claude/hooks/block-env-dump.js` ทุกครั้ง
  (hook ตรวจ**ข้อความในคำสั่ง** ไม่ใช่เจตนา — แม้แต่ commit message ที่มีชื่อไฟล์นั้นก็โดน)
- **`scp` / `cat script | ssh … node`** — โดน auto-mode classifier ตัดก่อนยิงออก
  (มันไม่ได้ห้ามแก้ข้อมูล prod — `npm run migrate up` ที่ UPDATE 81 แถวยังผ่าน · ตัวแปรคือโค้ดผ่าน git หรือเปล่า)
- สคริปต์ที่ต้องโหลดตัวแปรสภาพแวดล้อมเอง ใช้ `node -r dotenv/config <script>` หรือ
  `node --import ./scripts/smoke/_envload.mjs <script>` — **อย่าพิมพ์ `--env-file=…`** จะชน hook
- **งานที่ต้องรันซ้ำได้ ห้ามทำเป็น migration** (node-pg-migrate จำว่า "รันแล้ว" ถาวร) → ทำเป็น `scripts/`

**`Applied: xxx` ไม่ได้แปลว่าข้อมูลเปลี่ยนจริง** — แค่แปลว่า SQL ไม่ error · `UPDATE` ที่ WHERE ผิด
จะโดน 0 แถวแล้วผ่านฉลุย บันทึกว่าเสร็จถาวร → **ต้อง query นับก่อน/หลังทุกครั้ง**

---

## 📋 Import / Sync Scripts

**PRODUCTION: Always run with `sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/...'`**

Scripts ที่ loop upsert ข้อมูลจำนวนมากต้องมี:
- บอก total ก่อนเริ่ม เช่น `Fetched 500 members, upserting...`
- progress inline ทุก N records เช่น `\r  120/500 (2 errors)` (ใช้ `process.stdout.write`)
- สรุปตอนจบ เช่น `Done: 498 upserted, 2 errors`

## 🔐 Environment Variables (key names)

- `DISCORD_BOT_TOKEN` — bot login token
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — OAuth
- `GUILD_ID` — Discord server ID (used by bot + web API)

## 🧪 Testing (web/)

```bash
cd web && npm test          # รันครั้งเดียว
cd web && npm run test:watch  # watch mode
```

- Test files: `web/lib/__tests__/*.test.js`
- ตอนนี้มี: `financeAccess.test.js` (48), `callingAccess.test.js` (37)
- **รัน `npm test` ก่อน commit ทุกครั้งที่แก้ไฟล์ใน `lib/financeAccess.js` หรือ `lib/callingAccess.js`**

---

## ⚠️ Known Gotchas

### Timezone bug — `updateTransaction` / `createTransaction`
`txn_at` ที่รับมาจาก form input เป็น local Thai time string (`"2026-04-19T23:20"`)  
**ห้ามแปลงผ่าน `new Date(txn_at).toISOString()`** — Node.js server ทำงานใน UTC จะทำให้เวลา +7 ชั่วโมงทุกครั้งที่ save  
ให้ pass `txn_at || null` ตรงๆ ให้ pg (node-postgres) จัดการเอง

### Calling — `contact_type` ใน SQL ต้องใส่เสมอ
`calling_logs`, `calling_assignments`, `calling_member_tiers`, `calling_starred` ใช้ `member_id` ร่วมกันทั้ง member และ contact  
`cache_pple_member.source_id` = **1–169505** ส่วน `calling_contacts.id` = **12–601** → ช่วง id **ทับกันเต็มๆ ตั้งแต่ตอนนี้** (ไม่ใช่ปัญหาอนาคต)  
→ ทุก JOIN หรือ WHERE บนตาราง shared ต้องใส่ `AND contact_type = 'member'` หรือ `'contact'` เสมอ  
→ DB functions ทุกตัวใน `db/calling/` มี default `contactType = 'member'` แล้ว ไม่ต้องส่งถ้าเป็น member flow

### Debug mode — `discordId` เป็น null
เมื่อ Admin เปิด "View as role" cookie `debug_role` จะทำให้ทั้ง server (`getEffectiveIdentity`) และ client (`useEffectiveRoles`) คืน `discordId: null`  
→ ป้องกัน ownership bypass ใน debug mode  
→ role-based access ยังทำงานปกติ แค่ ownership หาย

---

## ⛔ Off-limits

- `.env` — ห้ามอ่านหรือแสดงค่า ยกเว้น key ที่ขึ้นต้นด้วย `DB_` (เช่น `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`) อนุญาตให้อ่านเพื่อ debug local ได้
  - Technically enforced, not just a written rule — see `.claude/settings.json` (`permissions.deny` on `Read`) และ `.claude/hooks/block-env-dump.js` (บล็อกคำสั่ง `Bash` ที่จะ dump เนื้อไฟล์). Ported 2026-08-28 จาก civicflow repo หลังเกิดเหตุ `tail -3 .env.local` หลุด service-role key จริงเข้า transcript ที่นั่น — กฎเขียนไว้เฉยๆ ไม่กันเคสที่คำสั่งมีเป้าหมายอื่นแต่ดันกวาดโดนบรรทัด secret ไปด้วย
