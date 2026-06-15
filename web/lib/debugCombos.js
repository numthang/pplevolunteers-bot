// view-as-role combos — preview ว่าแต่ละ role เห็นอะไร (resolve ผ่าน dc_guild_roles จริง)
// คัดตาม use case จริง ไม่ใส่ตัวซ้ำ: ผู้ประสานงานภาค=รองเลขาธิการ (regional_coordinator),
// กรรมการจังหวัด≈ผู้ประสานงานจังหวัด (district≈province ปัจจุบัน)
// ⚠️ view-as-role เปลี่ยนเฉพาะหน้าที่ filter ตาม role/permission/scope —
//    finance (visibility), calling members/contacts/campaigns (scope), Nav/bot (admin gate)
//    หน้า assignee (งานที่ถูก assign ให้ตัวเอง) + stats (รวมทั้ง guild) ไม่เปลี่ยนตาม role โดยตั้งใจ
export const DEBUG_COMBOS = [
  { label: '(ไม่มียศ) · อาสาทั่วไป',           roles: [] },
  { label: 'Moderator',                        roles: ['Moderator'] },
  { label: 'เหรัญญิก · ราชบุรี',               roles: ['เหรัญญิก', 'ทีมราชบุรี'] },
  { label: 'ผู้ประสานงานจังหวัด · ราชบุรี',    roles: ['ผู้ประสานงานจังหวัด', 'ทีมราชบุรี'] },
  { label: 'ผู้ประสานงานภาค · ภาคกลางตะวันตก', roles: ['ผู้ประสานงานภาค', 'ทีมภาคกลางตะวันตก'] },
  { label: 'เลขาธิการ',                        roles: ['เลขาธิการ'] },
  { label: 'Admin',                            roles: ['Admin'] },
]
