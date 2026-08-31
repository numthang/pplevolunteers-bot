---
description: ตรวจงานออกแบบ/หน้าจอของแอพจากภาพจริง (มือถือใช้ scripts/dev/mobileAudit.mjs)
argument-hint: [--routes /a,/b] [--width 375] [--base http://localhost:3000]
---

Arguments: $ARGUMENTS

> ⚠️ **`openwolf designqc` ตายแล้ว** — openwolf 2.5.0 ไม่มี subcommand นี้ (สั่งไปจะคืน help เฉยๆ
> แบบ exit 0 = พังเงียบ ดูเหมือนสำเร็จ) คำสั่งนี้เลยเปลี่ยนมาใช้สคริปต์ในรีโปแทน (2026-08-31)

## 1. ตรวจ layout มือถือ (อัตโนมัติ — ทำก่อนเสมอ)

```bash
node scripts/dev/mobileAudit.mjs --routes /kanban          # หรือ --all กวาดทุกโซน
node scripts/dev/mobileAudit.mjs --routes /kanban --shot   # เก็บภาพลง .wolf/mobile-audit/ ด้วย
```

รายงาน 5 อาการ เทียบกับ **ความกว้างจอที่สั่ง** (ไม่ใช่ `innerWidth` — ดูเหตุผลในหัวไฟล์สคริปต์):
`A` หน้ากว้างเกินจอ · `D` จอถูกถ่างจนหน้าถูกย่อ · `B` element ล้นขอบ (ชี้ตัวการนอกสุด) · `C` ของโดน `overflow-hidden` ตัดหาย
· `E` แถวที่มี select/input แล้วเหลือที่ว่างท้ายแถว = ตัวควบคุมไม่เต็มความกว้าง (**คำแนะนำ ไม่ทำให้ exit 1**)

- exit code 1 = เจอปัญหา · ต้องแก้ให้เหลือ 0 ก่อนบอกว่างานเสร็จ
- หน้าที่มี dropdown/modal ให้เพิ่ม `steps` ใน `scripts/dev/mobileAudit.routes.mjs` ไม่งั้นตรวจไม่ถึง
- **ไม่แทนการกดจริง** — ยังต้องเปิดดูเองตาม `md/WEB.md §จอมือถือ`

## 2. ตรวจงานออกแบบด้วยสายตา (เมื่อผ่านข้อ 1 แล้ว)

1. `--shot` แล้วอ่านภาพใน `.wolf/mobile-audit/` ด้วย Read tool (ภาพละ ~2,500 token — เลือกเฉพาะหน้าที่ต้องดู)
2. ตรวจกับกฎของโปรเจกต์ที่เขียนไว้แล้ว **ไม่ใช่มาตรฐานลอยๆ**:
   - `md/WEB.md §Type scale` (5 ขนาด · ห้าม `text-xs` · การ์ด `rounded-lg` · ปุ่ม `px-4 py-2 text-base`)
   - `md/WEB.md §Dark Mode Classes` (`dark:text-disc-text`, `dark:border-disc-border`, `bg-card-bg`)
   - `md/WEB.md §จอมือถือ` · `§ความกว้างของหน้า` (`data-wide`)
   - ลอกทรงจาก `web/components/calling/` เสมอ ห้ามคิดสเกลใหม่เอง
3. เสนอจุดที่ต้องแก้พร้อมเหตุผล → user เคาะ → แก้ → รันข้อ 1 ซ้ำให้ผ่าน
