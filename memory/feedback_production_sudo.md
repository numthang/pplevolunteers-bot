---
name: Production sudo -u www
description: คำสั่งที่รันบน production ต้องใช้ sudo -u www นำหน้าเสมอ
type: feedback
---

คำสั่งที่รันบน production server ต้องใช้ `sudo -u www` นำหน้าเสมอ

**Why:** server รันด้วย user `www` ถ้าไม่ใส่จะ permission error หรือไฟล์ถูกสร้างด้วย user ผิด

**How to apply:** ทุกครั้งที่แนะนำคำสั่งสำหรับรันบน production ให้ใส่ `sudo -u www` นำหน้าเสมอ เช่น:
- `sudo -u www node deploy-commands.js`
- `sudo -u www pm2 restart pple-dcbot`
- `sudo -u www git pull`
