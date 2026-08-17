import { redirect } from 'next/navigation'

// ผังทีมย้ายไป /team แล้ว (2026-08-17) — คงเส้นทางเดิมไว้ไม่ให้ลิงก์/บุ๊กมาร์กที่แชร์กันไว้ตาย
export default function OrgChartMoved() {
  redirect('/team')
}
