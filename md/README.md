# md/ — สารบัญเอกสาร

> **คำถามแบบไหน เปิดไฟล์ไหน** — ไฟล์นี้มีไว้ให้ไม่ต้องเดา
> จัดโครงนี้เมื่อ 2026-09-19 (ก่อนหน้านั้นทุกอย่างกองรวมที่ `md/` แล้วไฟล์เดียวทำ 4 หน้าที่)

## 🚦 เปิดไฟล์ไหน

| ถ้าคุณกำลังจะ… | เปิด |
|---|---|
| **แก้หน้าจอใน `web/`** (คลาส · สี · dark mode · type scale · มือถือ · การ์ด · ปุ่ม · ป้าย) | [rules/DESIGN.md](rules/DESIGN.md) |
| **เขียนโค้ดใน `web/`** (filter state · server component + DB · ฟอร์ม · i18n) | [rules/CODE.md](rules/CODE.md) |
| อยากรู้ว่า**ระบบประกอบด้วยอะไร อยู่ตรงไหน** | [reference/ARCHITECTURE.md](reference/ARCHITECTURE.md) |
| หา**ชื่อคอลัมน์ / โครงตาราง** | [reference/DATABASE.md](reference/DATABASE.md) |
| จะ **deploy / รัน migration บน prod** | [reference/DEPLOYMENT.md](reference/DEPLOYMENT.md) |
| ทำงานกับ**โมดูลใดโมดูลหนึ่ง** | [modules/](modules/) — ดูตารางข้างล่าง |
| อยากรู้ว่า**เหลืออะไรต้องทำ** | [PENDING.md](PENDING.md) |
| ตามหา**ของที่ทำเสร็จไปแล้ว / ทำไมถึงตัดสินใจแบบนั้น** | [archive/](archive/) |

**กฎที่มีเครื่องบังคับ** (query ต้องอยู่ใน `db/` · Create vs Update · i18n · คำสั่งบน production)
อยู่ใน [`CLAUDE.md`](../CLAUDE.md) ที่เดียว — ไฟล์ใน `md/` **ห้ามลอกกฎพวกนั้นมาเขียนซ้ำ** ให้ลิงก์ไปแทน

## 📦 โมดูล

| โมดูล | ไฟล์ | เรื่องอะไร |
|---|---|---|
| Finance | [modules/finance/FINANCE.md](modules/finance/FINANCE.md) | RBAC · schema · OCR สลิป · กองเงิน · รอบจ่ายเบี้ยเลี้ยง |
| Calling | [modules/calling/CALLING.md](modules/calling/CALLING.md) · [CONTACT.md](modules/calling/CONTACT.md) · [how-to-call.md](modules/calling/how-to-call.md) | ระบบโทร · tier · ผู้ติดต่อ (CRM) |
| Kanban (การบ้าน) | [modules/kanban/KANBAN.md](modules/kanban/KANBAN.md) · [CUSTOM-FIELDS.md](modules/kanban/CUSTOM-FIELDS.md) | บอร์ด · teamspace · ป้าย · custom field |
| Posts (งานสื่อ) | [modules/posts/POSTS.md](modules/posts/POSTS.md) | เขียน/เผยแพร่โพสต์ · คลังภาพ · การ์ดคำคม · AI |
| Docs (e-signature) | [modules/docs/DOCS.md](modules/docs/DOCS.md) | ใบสำคัญรับเงิน · ลายเซ็น · export |
| Case (เรื่องร้องเรียน) | [modules/case/CASE.md](modules/case/CASE.md) | รับเรื่อง · timeline · เธรด Discord |
| Org / Auth | [modules/org/AUTH.md](modules/org/AUTH.md) · [ORG_ACCESS_REDESIGN.md](modules/org/ORG_ACCESS_REDESIGN.md) | ตัวตน · ยศ · ขอบเขตพื้นที่ |
| Discord Bot | [modules/discord/BOT.md](modules/discord/BOT.md) · [SERVER_WIZARD.md](modules/discord/SERVER_WIZARD.md) · [RAG.md](modules/discord/RAG.md) | คำสั่งบอท · ตั้งค่าเซิร์ฟเวอร์ · ค้นในฟอรัม |
| Cooking | [modules/cooking/COOKING.md](modules/cooking/COOKING.md) · [MENUS.md](modules/cooking/MENUS.md) | แอปส่วนตัว (ไม่มี org) |

## 🗂 โครงโฟลเดอร์ + หลักที่ใช้ตัดสินว่าอะไรอยู่ไหน

```
md/
  README.md      ← ไฟล์นี้
  PENDING.md     งานค้างจริงเท่านั้น
  rules/         อ่านก่อนลงมือ = ข้อบังคับ
  reference/     เปิดเมื่อต้องการ ไม่ต้องอ่านทุกครั้ง
  modules/       เอกสารรายโมดูล
  decisions/     เตรียมที่ไว้สำหรับ ADR (ยังไม่เริ่มใช้)
  archive/       ของที่จบไปแล้ว + scratch ของ session เก่า
  TEAM/          ⛔ scratchpad ส่วนตัวของ user — ห้ามแตะ
```

- **1 ไฟล์ = 1 หน้าที่** — ห้ามให้ไฟล์เดียวเป็นทั้งกฎ ทั้งอ้างอิง ทั้งบันทึกงาน
  (`WEB.md` เดิมทำ 4 หน้าที่ใน 674 บรรทัด แล้วถูกสั่งให้อ่านทุกครั้ง = จ่าย 13,500 token ทุกการแก้ไฟล์)
- **กฎเดียวอยู่ที่เดียว** ที่เหลือลิงก์มา — มี 2 ชุดเมื่อไหร่ เพี้ยนกันเองเมื่อนั้น (เคยมี 3 ชุดมาแล้ว)
- **สำเนา schema ห้ามมี** — `reference/DATABASE.md` generate จาก DB จริง โมดูลลิงก์ไปเท่านั้น
- **อะไร lint ได้ อย่าเขียนลงเอกสารอย่างเดียว** — วัด 2026-09-19: กฎที่มีเครื่องตรวจ ละเมิด **0 จุด** ·
  กฎที่มีแต่ข้อความ ละเมิด **16–403 จุด** ทุกข้อ
