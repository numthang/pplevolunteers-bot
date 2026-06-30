---
marp: true
theme: default
paginate: true
style: |
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');

  section {
    background-color: #002b49;
    color: #ffffff;
    font-family: 'Sarabun', sans-serif;
    font-size: 28px;
    padding: 60px 80px;
  }

  h1 {
    color: #ff6a13;
    font-size: 52px;
    font-weight: 700;
    margin-bottom: 20px;
    line-height: 1.2;
  }

  h2 {
    color: #ff6a13;
    font-size: 38px;
    font-weight: 600;
    margin-bottom: 24px;
  }

  h3 {
    color: #b5d1dc;
    font-size: 26px;
    font-weight: 400;
    margin-bottom: 12px;
  }

  strong {
    color: #ff6a13;
  }

  ul {
    margin-left: 0;
    padding-left: 1.4em;
    line-height: 1.8;
  }

  li {
    margin-bottom: 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 22px;
    margin-top: 20px;
  }

  th {
    background-color: #ff6a13;
    color: white;
    padding: 10px 14px;
    text-align: left;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid #1a4a6b;
  }

  tr:nth-child(even) td {
    background-color: #003a63;
  }

  blockquote {
    border-left: 4px solid #ff6a13;
    padding-left: 24px;
    margin: 28px 0 0 0;
    font-style: italic;
    color: #b5d1dc;
    font-size: 26px;
    line-height: 1.6;
  }

  code {
    background-color: #003a63;
    padding: 2px 8px;
    border-radius: 4px;
    color: #b5d1dc;
    font-size: 22px;
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }

  /* Title slide */
  section.title {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
  }

  section.title h1 {
    font-size: 64px;
    margin-bottom: 12px;
  }

  section.title p {
    color: #b5d1dc;
    font-size: 28px;
  }

  /* Accent slide */
  section.accent {
    background-color: #ff6a13;
  }
  section.accent h1,
  section.accent h2 {
    color: #ffffff;
  }
  section.accent blockquote {
    border-left-color: #002b49;
    color: #002b49;
  }

  /* Dark slide */
  section.dark {
    background-color: #001a2e;
  }

  /* Paginate */
  section::after {
    color: #b5d1dc;
    font-size: 18px;
    opacity: 0.6;
  }
---

<!-- _class: title -->

# Building a Community Space
# with Discord

Amnesty International Thailand

---

## Discord มีแทบทุกอย่าง — ฟรี และดีกว่า

| ความสามารถ | LINE | Facebook | Slack 💰 | **Discord ฟรี** |
|---|:---:|:---:|:---:|:---:|
| แบ่งห้องตามหัวข้อ | ✗ | ✗ | ✓ | ✓ |
| จัดการสิทธิ์รายคน | ✗ | บางส่วน | ✓ | ✓ |
| Bot / Automation | ✗ | ✗ | จำกัด | ✓ |
| Event + Voice | ✗ | บางส่วน | ✗ | ✓ |
| ประวัติบทสนทนา | ✗ | จำกัด | จำกัด | ✓ |
| AI Integration | ✗ | ✗ | ✗ | ✓ |

---

## ปัญหาของ NGO: ทำงานในมืด

- คนอยากช่วย **แต่ไม่รู้ว่ากำลังทำอะไรอยู่**
- งานสำคัญเกิดในกลุ่มเล็กๆ ไม่มีใครเห็น
- สมาชิกใหม่เข้ามาแล้ว **ไม่รู้จะเริ่มตรงไหน**
- ผู้นำ burnout เพราะแบกงานไว้คนเดียว

> "ปัญหาไม่ใช่ขาดคน — ปัญหาคือคนเห็นกันไม่ถึง"

---

<!-- _class: accent -->

# พื้นที่แห่งความไว้วางใจ

การเปิดพื้นที่ไม่ใช่แค่ "ให้คนเห็น"
แต่คือการแสดงออกถึง**ความไว้วางใจ**

> เปิดเผย → สมาชิกไว้วางใจองค์กร
> โปร่งใส → องค์กรไว้วางใจสมาชิก

---

## หลักออกแบบ: Public First

**กฎหลัก:** ห้อง private คือ**ข้อยกเว้น** ไม่ใช่ default

เมื่อคนเห็นว่าเราทำงานจริง → เขาจะยื่นมือมาช่วย

ถ้าไม่แน่ใจ → **เลือก public เสมอ**

| 📢 Public | 🔒 Member | 🛡️ Private |
|---|---|---|
| ประกาศ, ข่าวสาร | ทีมงาน, แผนงาน | Admin เท่านั้น |
| ทุกคนเห็น | สมาชิกเท่านั้น | กรณีอ่อนไหว |

---

## เริ่มสร้าง Server

**3 สิ่งแรกที่ต้องมี:**

1. **📢 ช่องประกาศ** — public, ทุกคนเห็น
2. **💬 ห้องกลาง** — พูดคุยทั่วไป public
3. **🏷️ Role พื้นฐาน** — สมาชิก / ทีมงาน / admin

**ข้อควรระวัง:**
อย่าสร้างห้องมากเกินไปตั้งแต่แรก
Server ที่มีห้องว่าง 20 ห้อง ทำให้ดูเงียบและน่ากลัว

> เริ่มน้อย → ขยายตามการใช้จริง

---

<!-- _class: dark -->

## 🔴 Demo: PPLE Volunteers Server

**ดูของจริง — server ที่ใช้งานกับอาสาสมัคร 2,000+ คน**

สิ่งที่จะชี้ให้ดู:

- โครงสร้าง categories และห้องต่างๆ
- ห้อง public vs private ใน UI
- Activity ที่คนเห็นกันได้
- Role สีต่างๆ และสิทธิ์ที่ต่างกัน
- ตัวอย่างกระทู้ที่มีคนมีส่วนร่วม

---

## Admin vs Moderator

| | **Admin** | **Moderator** |
|---|---|---|
| จำนวน | 1-2 คน | หลายคน |
| หน้าที่ | ตั้งค่า, bot, permissions | ดูแลบรรยากาศ, ต้อนรับ |
| ทักษะ | Technical | Community sense |
| ความถี่ | ตั้งครั้งแรก + แก้บางครั้ง | ทุกวัน |

> "Admin ที่ดีต้องมีทั้ง 2 ทักษะ — แต่หายาก
> ถ้าต้องเลือก: **community sense สำคัญกว่า** เพราะ technical ฝึกได้"

---

## Engagement Tools

เครื่องมือที่ Discord มีให้ — ใช้ได้ทันที ไม่ต้อง technical:

- **@mention** — เรียกถูกคน ถูกเวลา ไม่ spam ทั้งกลุ่ม
- **Forum channels** — กระทู้ discussion ที่คนตอบกลับได้
- **Events** — สร้าง event, RSVP, แจ้งเตือนอัตโนมัติ
- **Threads** — คุยลึกโดยไม่รบกวนห้องหลัก
- **Stage** — town hall, พูดคุยสาธารณะ
- **AI Bot** — ตอบคำถาม, สรุป, onboard สมาชิกใหม่

---

## ทำยังไงให้ Community โตเอง

Community โตได้เมื่อ:

1. คนเห็นว่า**มีคนทำงานอยู่** → อยากเข้ามาร่วม
2. เข้าร่วมได้**ง่าย** → ไม่มีขั้นตอนซับซ้อน
3. **ได้รับการตอบสนอง** → พูดแล้วมีคนฟัง
4. มี **quick win** → ทำแล้วเห็นผลได้เลย

**เริ่มได้เลยวันนี้:**

1. สร้าง server (5 นาที)
2. ตั้ง 3 ห้องแรก + 2 role
3. ชวน team 5 คนแรก → ทำงานใน public

> "Community ดีๆ เริ่มจากคนแค่ 5 คน"
