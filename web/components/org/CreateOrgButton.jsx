'use client'
import { useState } from 'react'
import CreateOrgModal from './CreateOrgModal.jsx'

// ปุ่ม + modal สร้างองค์กร (self-contained) — ใช้ใน server component เช่น empty-state ของ OrgHome
export default function CreateOrgButton({ className = '', children }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>{children}</button>
      <CreateOrgModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
