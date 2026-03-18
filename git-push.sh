#!/bin/bash

# 1. ตรวจสอบว่าใส่ Commit Message มาไหม
if [ -z "$1" ]
  then
    echo "❌ ใส่ Message ด้วยสิครับ เช่น: ./push.sh 'fix: role logic'"
    exit 1
fi

# 2. เริ่มกระบวนการ Git
echo "🚀 กำลังดันโค้ดขึ้น Git..."

git add .

# ใช้ $1 คือข้อความแรกที่พิมพ์ต่อท้ายคำสั่ง
git commit -m "$1"

# ดันขึ้น branch ปัจจุบันที่ใช้งานอยู่
git push

echo "✅ เรียบร้อย! โค้ดไปรออยู่บน Cloud แล้ว"