export const metadata = { title: 'ของฉัน' }

// hub ปล่อยผ่าน — sidebar อยู่ที่ app/profile/settings/layout.js เฉพาะโซนตั้งค่า
// (เหมือน /org ที่ hub ไม่มี sidebar แต่ /org/settings มี)
export default function Layout({ children }) { return children }
