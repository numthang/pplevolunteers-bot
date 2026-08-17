import { redirect } from 'next/navigation'

// 2026-08-18: กระดานย้ายไปรวมกับหน้าแรกแล้ว (ปุ่ม "จัดกลุ่ม: ตามสถานะ" คือหน้านี้)
// เก็บ route ไว้เพราะลิงก์เก่าถูกแชร์ในดิสฯ ไปแล้ว — เหมือน /bot/orgchart → /team
export default function KanbanBoardRedirect() {
  redirect('/kanban')
}
