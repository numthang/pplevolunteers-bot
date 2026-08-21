# CivicFlow — Dev Agreement & กติกาทำงานร่วม (ร่าง — รอคุยกับทีม CivicFlow)

> จดไว้ตอนที่ยังไม่มี repo จริง (2026-08-19) เพื่อกันลืมตอนของมาถึง — ทุกอย่างในนี้ยังเป็น**ร่าง** รอเคาะกับทีม CivicFlow อีกที

## สถานะตอนนี้

- `/home/tee/VSites/node/civicflow` ยังว่าง ไม่มี `git init` — รอ repo ตัวเต็ม (backend/production จริง ไม่ใช่ mockup HTML) จากทีม CivicFlow
- ขอบเขตแรกที่คุยไว้ = **Audit**: Security / Stability / Performance / Dependencies (ดู `NOTE.md`)
- มีข้อเสนอคู่ขนาน: ย้าย hosting จาก Vercel → VPS ของเราเอง (เหตุผลอยู่ `NOTE.md`)

## ช่องทางคุยงานกับทีม CivicFlow

**ยังไม่เคาะ** — ต้องถามทางโน้นว่าจะคุยงานกันทางไหน (Slack / email / GitHub PR comment / อื่นๆ) แล้วมาเติมตรงนี้

## Skill ที่จะลงทันทีที่ repo มาถึง

อ้างอิงชุดเดียวกับที่ใช้ใน pple-volunteers:

1. **`git init`** (หรือ clone ของที่ทีม CivicFlow ส่งมา)
2. **Project-level Claude Code skills** (`.claude/skills/`, commit เข้า repo ให้ dev คนที่สองได้ทันทีตอน clone):
   - `scrutinize` (จาก [9arm-skills](https://github.com/thananon/9arm-skills)) — ใช้ก่อน implement feature ใหญ่/refactor ทุกครั้ง
   - ตัวอื่นจาก [ui-skills](https://github.com/ibelick/ui-skills) (`baseline-ui`, `fixing-accessibility`, `frontend-design` ฯลฯ) — เลือกเฉพาะที่เกี่ยวกับงานจริง ไม่ต้องลงทั้งชุด
3. **OpenWolf** (`npm install -g openwolf` → `openwolf init` ในโปรเจกต์)
   - `.gitignore`: ignore `.wolf/*` แล้ว unignore เฉพาะ `.wolf/cerebrum.md` + `.wolf/anatomy.md` — สอง dev เห็น context/preference เดียวกันผ่าน git ปกติ (`git pull` ก่อนเริ่ม, commit แยกสั้นๆ `chore(wolf): sync brain` หลังอัพเดทมีนัยสำคัญ)
   - ไฟล์ log อื่น (`memory.md`, `buglog.json`, `token-ledger.json`, `designqc-captures/`, `hooks/`) ยัง gitignore เหมือนเดิม เพราะโตทุก session ไม่ควรเข้า git
   - ตั้ง `.claude/rules/openwolf.md` ให้ตรงกับ flow นี้ (ดูตัวอย่างจาก pple-volunteers)

## กฎที่ใช้เสมอ (ร่างจาก pple-volunteers CLAUDE.md — เอาไปคุยกับทีม CivicFlow ว่ารับได้ไหม)

> 🔍 **นี่คือ "ต้องทำอะไร" — ส่วน "เช็คยังไงว่าทำจริง" อยู่แยกที่ [`md/AUDIT.md`](AUDIT.md)** (checklist 9 หัวข้อ ใช้ตรวจซ้ำได้เรื่อยๆ ทั้ง pple-volunteers และ CivicFlow) อย่าลอกเนื้อหา AUDIT.md มาวางซ้ำที่นี่ — แก้ทีเดียวที่เดียว ไม่งั้นสองไฟล์จะดริฟต์ไม่ตรงกัน

- **Confirm ก่อนลงมือ** เฉพาะงานที่ scope/approach ไม่ชัด — งาน obvious ทำได้เลยไม่ต้องถาม
- **Commit เองได้** เมื่อก้อนงานจบ + verify แล้ว แต่ **push ต้องถามก่อนทุกครั้ง**
- **ก่อน implement ฟีเจอร์ใหม่/refactor ทุกครั้ง — รัน scrutinize ก่อนเสมอ**
- **SQL migration รวมไว้ไฟล์เดียว** พร้อม comment วันที่ + คำอธิบาย ไม่กระจายหลายไฟล์
- **DB Connection — 3-Layer Pattern ตั้งแต่ day 0** (ดูรายละเอียด `md/AUDIT.md` §1): Connection Singleton ไฟล์เดียว → Service/Repository Layer เก็บ SQL ทั้งหมด → API Route/UI ห้ามยิง SQL ตรง เรียกผ่าน Service Layer เท่านั้น — สำคัญเป็นพิเศษเพราะเป็นเหตุผลหลักที่แนะนำให้ย้ายออกจาก Vercel+Supabase
- **Multi-tenant isolation**: ทุก query บนตารางที่ผูกกับ tenant ต้อง filter `org_id` เสมอ — เคยพังจริงมาแล้วที่ pple-volunteers (id ทับกันข้าม type ในตารางร่วม) อย่าให้เกิดซ้ำ
- **เช็คตารางซ้ำก่อนสร้างใหม่** — ก่อนสร้างตาราง config/setting ใหม่ grep หาว่ามีตารางที่ทำหน้าที่คล้ายกันอยู่แล้วไหม (โปรเจกต์ใหม่ที่ AI เขียนเยอะ เสี่ยงสร้างซ้ำสูง)
- **คอลัมน์ `org_id`/`owner_id` วางไว้ข้างหน้าตาราง** ไม่ใช่ต่อท้ายตอน ALTER — จัด in-place ตั้งแต่ออกแบบ schema
- **File storage ห้ามผูก SDK เฉพาะแพลตฟอร์ม** — ใช้ S3-compatible API (แม้เริ่มบน Supabase Storage/R2 ก็ตาม) กันเหตุผลเดียวกับที่กัน Vercel/Supabase lock-in ฝั่ง DB
- **No over-engineering** — ไม่เพิ่ม abstraction/feature เกินที่ task ต้องการ ไม่ทำ future-proofing ที่ยังไม่มีใครขอ
- **Modal ทุกตัวต้องมี** ปุ่ม X + ESC + click-outside ครบ 3 อย่าง
- **Timezone-safe**: อย่าพึ่ง `new Date(x).toISOString()` กับ local time string เพราะ server รันเวลา UTC จะเพี้ยนชั่วโมง
- **Testing**: มี test suite สำหรับ logic สำคัญ (access control/permission) รัน `npm test` ก่อน commit ไฟล์พวกนี้เสมอ
- **Security ตาม OWASP top 10 พื้นฐาน** — sanitize input, ห้าม log/commit secret, ระวัง SQL injection/XSS
- **i18n (ถ้าเกี่ยวข้อง)**: string ที่ user เห็นในโค้ดใหม่ผ่าน translation key เสมอ ไม่ hardcode
- **Create vs Update บนฟอร์ม**: หน้า Create ต้องมีปุ่มบันทึกชัดเจน ห้าม autosave/สร้าง record ก่อนกดปุ่ม; หน้า Update ที่มี autosave ห้ามมีปุ่มซ้ำ ใช้ป้ายสถานะ + เตือนตอนปิดแท็บแทน (กฎนี้อาจไม่ relevant กับ CivicFlow ตัด/ปรับตามจริง)

## Workspace/หน้าต่าง VSCode — แยกจาก pple-volunteers เสมอ

**เคาะ 2026-08-19:** เส้นแบ่งไม่ใช่ "เว็บเดียวกันไหม" แต่คือ **repo ไหนมี `CLAUDE.md` ของตัวเอง = ควรมีหน้าต่าง VSCode ของตัวเอง** ไม่งั้น CLAUDE.md/memory ของมันจะไม่ auto-load เลย (เจอปัญหานี้จริงตอนคุย civicflow ใน session ที่ anchor อยู่กับ pple-volunteers — ไฟล์นี้เขียนไปแล้วแต่ session อื่นที่ยังไม่ cd เข้ามาจะไม่เห็น)

**วิธีเริ่ม session ของ civicflow ให้ถูก:**
```bash
cd /home/tee/VSites/node/civicflow
claude
```
หรือ VSCode: `File → New Window` → `File → Open Folder` เลือก folder นี้ (อย่าใช้ `Add Folder to Workspace` ปนกับ pple-volunteers)

**ข้อยกเว้นเดียวที่รวม workspace ได้:** ตอนกำลัง cross-reference สองโค้ดพร้อมกันแบบ `calling.ppleth.ai` ที่ port feature มาจาก pple-volunteers ตรงๆ — civicflow ไม่เข้าเงื่อนไขนี้ (ไม่มีโค้ดเกี่ยวข้องกับ pple-volunteers เลย) ควรแยกหน้าต่างตั้งแต่ต้น

## Pending — ต้องเติมทีหลัง

- [ ] ช่องทางสื่อสารกับทีม CivicFlow
- [ ] stack จริง (framework/DB) ของ CivicFlow — ยังไม่ได้คำตอบ
- [ ] ใครเป็นคนดูแล production หลัง audit (VPS ของเราเอง ตามที่เสนอไว้?)
- [ ] สร้าง `CLAUDE.md` เปล่าๆ ใน civicflow ชี้ไปที่ `md/DEV_AGREEMENT.md` (ยังไม่ได้ทำ — รอ user คอนเฟิร์ม)
