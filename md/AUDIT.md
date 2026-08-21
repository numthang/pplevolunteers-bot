# AUDIT — Vendor Lock-in & DB Connection Architecture

สรุปจาก chat กับ AI ตัวอื่นเรื่องความเสี่ยง Vercel+Supabase lock-in — ใช้เป็น **prompt/checklist สำหรับตรวจซ้ำได้ในอนาคต** (ไม่ใช่ที่จดผล audit — ผลตรวจจริงของโปรเจกต์นี้อยู่ที่ [PENDING.md](PENDING.md))

---

## 1. หลักการไม่ให้โค้ดติด Platform

**ปัญหาที่พบบ่อยเมื่อให้ AI ปั๊มโค้ด:** ยิง SQL/SDK ตรงใน UI Component, logic ซ้ำกันหลายไฟล์แทนที่จะ refactor รวม, ผูกกับ SDK เฉพาะแพลตฟอร์ม (Supabase Client, Vercel-specific API) — ผลคือย้าย platform ทีหลังต้องรื้อเขียนใหม่ทั้งก้อน

**ทางออก — 3-Layer Pattern:**
1. **Connection Singleton** (`db.ts`/`db/index.js`) — instance เดียวทั้งแอป ห้าม `new Pool()` กระจายหลายไฟล์
2. **Service/Repository Layer** (`/services`, `/repositories`, `/db`) — SQL หรือ ORM query อยู่ที่นี่เท่านั้น
3. **API Route / UI Layer** — ห้ามยิง DB ตรง ต้องเรียกผ่าน Service Layer

**Connection Pooling:** ห้าม Node ยิงตรงหา Postgres — ต้องผ่าน pooler
- VPS: PgBouncer หรือตั้ง `max` ใน pool ของ ORM
- Supabase Cloud: Supavisor (port 6543, transaction mode)

**`.env` แยก connection ตามงาน:**
```env
DATABASE_URL="postgres://...@host:6543/db?pgbouncer=true"  # ผ่าน pooler — ใช้งานทั่วไป
DIRECT_URL="postgres://...@host:5432/db"                    # ตรง — migration/DDL เท่านั้น
```

**Exit strategy:** ใช้ Postgres มาตรฐาน + S3-standard storage (ไม่ใช่ SDK เฉพาะแพลตฟอร์ม) → วันไหนย้าย VPS ↔ Supabase แค่ dump/restore `.sql` + เปลี่ยน connection string บรรทัดเดียว ไม่ต้องแตะ business logic

**Checklist ก่อนเริ่มโปรเจกต์ใหม่ / ก่อนสั่ง AI เขียน DB layer:**
1. เป้าหมายระยะยาว — แค่ MVP ไป Vercel+Supabase ได้เลย / ระบบใช้ยาว+data เยอะ ต้องวาง architecture กันย้าย
2. ถ้าใช้ PaaS เพื่อความไว ต้องตั้งกฎ AI (Prompt Guidelines/`.cursorrules`) แยก Data Layer ออกจาก UI ตั้งแต่วันแรก
3. เตรียม exit strategy เสมอ — open standard เท่านั้น (Postgres แท้ๆ, S3 standard)

---

## 2. Checklist ตรวจสุขภาพ DB Connection (ใช้ตรวจซ้ำได้เรื่อยๆ)

เวลาจะประเมินว่าโค้ด (ของเราเอง หรือโปรเจกต์ไหนก็ตาม) ยึด pattern ข้างบนแค่ไหน ให้ไล่ 4 ข้อนี้:

1. **การตั้งค่า Connection:** ต่อ Postgres ผ่าน Connection Pooler (PgBouncer/Supavisor) ไหม หรือยิงตรง port 5432?
2. **การจัดการ DB Instance ในโค้ด:** ตัวสร้าง connection (`new Pool()`/Client) เป็นไฟล์ singleton จุดเดียวไหม หรือกระจายสร้างใหม่หลายไฟล์?
3. **การแยก Layer:** SQL/ORM query เรียกกระจายอยู่ตาม UI/API Route ตรงๆ หรือรวมอยู่ใน service/repository layer?
4. **Environment Variables:** แยก `DATABASE_URL` (pooled) กับ `DIRECT_URL` (migration) ไหม หรือใช้ตัวเดียวทำทุกอย่าง?

**วิธีประเมิน:**
- ตอบแบบ "ไม่มี pooler, สร้าง client ใหม่เรื่อยๆ, SQL ฝังในหน้า UI" → เสี่ยงน็อกสูงถ้า traffic เพิ่ม + lock-in เต็มๆ ต้อง refactor ด่วน
- ตอบแบบ "มีไฟล์กลาง, ใช้ pooler อยู่แล้ว, แยก service ชัดเจน" → โครงสร้างดี ย้าย platform ไหนก็สะดวก

**Prompt สั่ง AI ให้ Refactor เมื่อผลตรวจไม่ผ่าน:**
> "ช่วย Refactor ระบบเชื่อมต่อ PostgreSQL ในโปรเจกต์นี้ให้เป็นไปตามสถาปัตยกรรมมาตรฐานดังนี้:
> 1. รวมการเชื่อมต่อ DB ทั้งหมดมาไว้ที่ไฟล์เดียว โดยใช้ Singleton Pattern เพื่อป้องกันการสร้าง Connection ซ้ำซ้อน
> 2. ตั้งค่า Connection Pooling โดยอ่านค่าจาก `DATABASE_URL` สำหรับการทำงานทั่วไป และ `DIRECT_URL` สำหรับ Migration
> 3. แยก Logic การ Query ข้อมูลออกจาก UI/API Route ไปไว้ใน service layer ทั้งหมด ห้ามยิง Query จากหน้า UI โดยตรง"

---

## 3. Checklist ตรวจเพิ่มเติม (นอกเหนือจาก DB connection)

ใช้เวลารับหน้าที่ audit code ทั้งระบบ — ไล่ 9 หัวข้อนี้ต่อจากหมวด DB connection ข้างบน (7-8 ยังไม่เคาะว่าจะเอาหรือไม่เอา ทำเครื่องหมายไว้ก่อน):

### 3.1 Security พื้นฐาน
- Query ทุกจุดใช้ parameterized (`$1, $2`) หรือมีที่ต่อ string SQL เอง (ช่อง SQL injection)?
- secrets (`.env`, token, password) เคยหลุดเข้า git history หรือ log ไหม?
- ทุก API route ที่ควรเช็คสิทธิ์ มี auth/role guard ครบจริงไหม หรือมีบางจุดลืม
- error ที่ตอบกลับ client มี query/stack trace จริงหลุดออกไปไหม

### 3.2 Multi-tenant isolation
- query ที่แตะตารางร่วม (มี `guild_id`/`org_id`) filter ครบทุกจุดไหม
- ตารางที่ id ทับกันข้าม type แบบ `calling_contacts`/`cache_pple_member` มีเคสอื่นแบบนี้อีกไหม (grep หา pattern คล้ายกัน)
- debug/"view as role" mode ปิด ownership ถูกต้องทุกจุดที่ใช้ `discordId` ไหม
- route ที่รับ `id` จาก client แล้ว query ตรง — เช็คว่า id นั้นอยู่ scope guild/org ปัจจุบันจริงไหม (กัน IDOR ข้าม tenant)

### 3.3 Dependency & test coverage
- `npm audit` ทั้ง root และ `web/` มีช่องโหว่ severity สูงไหม
- มี package deprecated/ไม่ maintained แล้วค้างอยู่ไหม
- โมดูลสำคัญ (finance, calling, auth, org access) มีเทสครอบคลุมแค่ไหน
- มี CI รัน test อัตโนมัติก่อน merge ไหม หรือรันมือ

### 3.4 File storage security
- ทุกจุด upload เช็ค mime แบบ allowlist ไหม (ไม่เชื่อ extension จาก client อย่างเดียว)
- จำกัดขนาดไฟล์ทุกจุดไหม (กัน DoS จากไฟล์ใหญ่)
- มี path traversal guard (เช็ค resolved path อยู่ใต้ base dir ก่อนแตะดิสก์) ครบทุกโมดูลที่เขียนไฟล์ไหม
- ไฟล์ sensitive (เช่นบัตร ปชช.) เสิร์ฟผ่าน gated API เท่านั้น ไม่ใช่ public URL ตรงไหม

### 3.5 Schema/table duplication
เช็ค**ก่อนสร้างตารางใหม่** ไม่ใช่ไล่นับจำนวนตารางที่มีอยู่ — มี 2 pattern ที่ถูกต้องอยู่แล้วในระบบนี้ ต้อง reuse ตาม pattern ให้ถูก ไม่ใช่สร้างตัวที่ 3 ขึ้นมาเฉยๆ:
- **key-value ทั่วไป ผูกกับ anchor entity ที่มีอยู่แล้ว** (เช่น `dc_guild_config` ต่อ guild, `org_config` ต่อ org, `user_config` ต่อ user) — ถ้า config ใหม่เป็นแค่ค่าเดี่ยวๆ ผูกกับ entity ที่มี anchor table แล้ว ให้ลงตรงนี้ ไม่ต้องสร้างตารางใหม่
- **ตาราง config เฉพาะฟีเจอร์ที่มี field ของตัวเอง** (เช่น `finance_config`, `dc_forum_config`) — ใช้เมื่อ field เป็นชุดเฉพาะฟีเจอร์ที่ query/join บ่อย ไม่ใช่ blob ทั่วไป

เช็คเพิ่ม:
- ถ้าจะ migrate ตารางเก่า → ใหม่ ต้องมี comment อธิบายเหตุผลตารางเก่าที่เหลืออยู่ (ถ้ามี) — ห้ามปล่อยตารางซ้ำไว้เฉยๆ โดยไม่มีคำอธิบาย
- เช็คจุดที่ **reader** ตามไปยังตารางใหม่ครบไหม ไม่ใช่แค่ writer (บั๊กที่เคยเกิดจริงกับ `dc_guild_config`→`org_config`: ย้าย write แล้ว reader บางจุดยังชี้ตารางเก่า = ตั้งค่าแล้วไม่มีผล)

### 3.6 Query performance
- **N+1 query:** ไล่หา pattern `for (...of...)` หรือ `.map(async...)` ที่มี `await pool.query()` ข้างในลูป — ควรเป็น single query ด้วย `WHERE id = ANY($1)` หรือ `JOIN` แทนการ query ทีละแถว
- **Index บนคอลัมน์ที่ query บ่อย:** โดยเฉพาะ `guild_id`/`org_id` ที่ทุก query filter ด้วยแทบทุกครั้ง (multi-tenant) — เช็คว่ามี index รองรับไหม ไม่งั้น full table scan ทุก request
- **SELECT \*** แทนที่จะระบุ column ที่ต้องใช้จริง — เปลืองทั้ง network และ memory โดยเฉพาะ endpoint ที่ join หลายตาราง
- **Pagination:** endpoint ที่ list ข้อมูล (เช่น cases, calling logs) มี `LIMIT`/`OFFSET` หรือ cursor ไหม หรือดึงทั้งหมดมาแล้วกรองฝั่ง JS
- **Monitoring:** มีทางรู้ query ไหนช้าไหม (`pg_stat_statements`, slow query log) หรือรู้ตอน user บ่นเท่านั้น

**วิธีประเมิน:** ถ้าตอบว่า "ไม่เคยเช็ค index, ไม่มี pagination, ไม่มี slow query log" → ตอนนี้อาจไม่รู้สึกเพราะข้อมูล/traffic ยังน้อย แต่จะเจอทันทีที่ data โต

### 3.7 Backup & disaster recovery
- backup รันจริงสม่ำเสมอไหม (ไม่ใช่แค่ตั้งไว้แล้วไม่เคยเช็ค)
- เคย **ทดลอง restore จริง** ไหม หรือรู้แค่ว่ามีไฟล์ backup อยู่
- backup เก็บ**นอกเครื่อง production** ไหม (ถ้าเครื่องเดียวกันพัง backup ก็หายไปด้วย)
- ถ้า DB ล่มตอนนี้ กู้คืนได้เร็วแค่ไหน (RTO) และข้อมูลหายได้มากสุดกี่ชั่วโมง (RPO) — เคยคำนวณจริงไหมหรือเดาเอา

### 3.8 Rate limiting / abuse protection
- endpoint สาธารณะที่ไม่ต้อง login (เช่น OTP request, แบบฟอร์มรับเรื่องร้องเรียน) มี rate limit ไหม (ต่อ IP/ต่อเบอร์/ต่อช่วงเวลา)
- ถ้าไม่มี — บอทหรือคนยิงสแปมรัวๆ ระบบจะเป็นยังไง (เปลือง SMS quota, เปลือง DB, DoS ตัวเอง)
- form ที่รับ input จาก public เช็ค CAPTCHA หรือ honeypot กันบอทไหม

### 3.9 CSS / Design System health

หลักการเดียวกับ DB — **Design Token** (สีสำคัญเป็น CSS variable เปลี่ยนที่เดียวได้) + **Component Class** สำเร็จรูป (`.btn`, `.card`, `.badge`) แทนที่จะก็อป utility class ยาวๆ ซ้ำทุกไฟล์:

- สีสำคัญ (`brand`, `background`, `foreground` ฯลฯ) ประกาศเป็น **CSS variable** หรือกระจายเป็น hex/ชื่อสีใน framework config เฉยๆ?
- ถ้าเปลี่ยนธีมทั้งเว็บ ต้อง **rebuild/deploy ใหม่** ไหม หรือเปลี่ยนค่าตอนรันไทม์ได้เลย (สำคัญมากถ้าระบบเป็น multi-tenant ที่อยากให้แต่ละ org/ลูกค้ามีสีแบรนด์ของตัวเอง)
- ปุ่ม/การ์ด/badge/input มี **component class** เรียกใช้ซ้ำได้ไหม หรือต้องก็อป utility string เต็มทุกครั้งที่เขียนใหม่
- **เช็ค compliance จริง อย่าเชื่อแค่ว่ามีกฎเขียนไว้ในเอกสาร** — grep หาการฝ่าฝืนกฎที่มีอยู่ (hardcode hex, class ที่ห้ามใช้, ขนาดที่กำหนดเอง) แล้วคิดเป็น % ของไฟล์ทั้งหมด เอกสารบอกกฎได้แต่ไม่รับประกันว่าทำตามจริง
- **Enforcement:** มี lint/automated check บังคับกฎ CSS ไหม หรือพึ่งคนอ่านเอกสารก่อนเขียนอย่างเดียว (ถ้าพึ่งคนอ่านล้วนๆ — ยิ่งไฟล์เยอะยิ่ง drift เร็ว)

**วิธีประเมิน:**
- compliance ต่ำ (เช่น >20-30% ไฟล์ฝ่าฝืนกฎที่มีอยู่) + ไม่มี enforcement อัตโนมัติ → ความเสี่ยง drift สูง โดยเฉพาะถ้ามีคนหลายคน/AI เขียน UI พร้อมกัน
- ถ้าระบบเป็น multi-tenant และอยากให้ธีมเปลี่ยนได้ต่อ tenant แบบรันไทม์ — framework config (เช่น Tailwind config) ไม่พอ ต้องมี CSS variable จริง

**⚠️ ข้อควรระวังตอน migrate:** ถ้าจะรื้อของเดิมมาใช้ token/component class — ห้ามทำรวดเดียวทั้งระบบถ้าไม่มี visual regression test เสี่ยงหน้าเว็บพังเงียบๆ หลายจุดพร้อมกัน ให้แยก (1) สร้าง token/class layer ก่อน (เสี่ยงต่ำ ไม่กระทบของเดิม) แล้วค่อย (2) ไล่ migrate ทีละโซน เปิดเบราว์เซอร์เช็คจริงก่อนไปโซนถัดไปเสมอ
