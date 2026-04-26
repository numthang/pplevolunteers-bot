'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PROVINCES = [
  'กรุงเทพ', 'นนทบุรี', 'สมุทรปราการ', 'สมุทรสาคร', 'ปทุมธานี',
  'ราชบุรี', 'นครปฐม', 'กาญจนบุรี', 'เพชรบุรี', 'สุพรรณบุรี',
  'สมุทรสงคราม', 'ประจวบคีรีขันธ์', 'อุทัยธานี', 'อ่างทอง', 'สระบุรี',
  'อยุธยา', 'นครนายก', 'ลพบุรี', 'ชัยนาท', 'สิงห์บุรี',
  'เชียงใหม่', 'เชียงราย', 'แม่ฮ่องสอน', 'ลำพูน', 'ลำปาง',
  'แพร่', 'พะเยา', 'น่าน', 'กำแพงเพชร', 'ตาก',
  'นครสวรรค์', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'สุโขทัย',
  'อุตรดิตถ์', 'ตราด', 'จันทบุรี', 'ระยอง', 'ชลบุรี',
  'ฉะเชิงเทรา', 'ปราจีนบุรี', 'สระแก้ว', 'อุดรธานี', 'หนองคาย',
  'บึงกาฬ', 'สกลนคร', 'มุกดาหาร', 'นครพนม', 'อำนาจเจริญ',
  'เลย', 'ชัยภูมิ', 'ขอนแก่น', 'กาฬสินธุ์', 'ยโสธร',
  'หนองบัวลำภู', 'มหาสารคาม', 'ร้อยเอ็ด', 'อุบลราชธานี', 'ศรีสะเกษ',
  'สุรินทร์', 'บุรีรัมย์', 'นครราชสีมา', 'ชุมพร', 'พังงา',
  'ระนอง', 'ภูเก็ต', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'ตรัง',
  'กระบี่', 'สงขลา', 'พัทลุง', 'สตูล', 'ปัตตานี',
  'ยะลา', 'นราธิวาส'
]

const inputCls = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function EditCampaignPage({ params }) {
  const { id } = use(params)
  const router = useRouter()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [province, setProvince] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/calling/campaigns/${id}`)
      .then(r => r.json())
      .then(data => {
        if (!data.data) { setNotFound(true); setLoading(false); return }
        const c = data.data
        setName(c.name || '')
        setDescription(c.description || '')
        setProvince(c.province || '')
        setEventDate(c.event_date || '')
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name) { alert('กรุณาใส่ชื่อแคมเปญ'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/calling/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, province: province || null, event_date: eventDate || null })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      router.push('/calling')
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-sm">กำลังโหลด...</div>
  if (notFound) return <div className="py-20 text-center text-red-500">ไม่พบแคมเปญ</div>

  return (
    <div>
      <Link href="/calling" className="text-indigo-600 dark:text-indigo-400 hover:underline mb-6 block text-sm">
        ← กลับ
      </Link>

      <div className="max-w-2xl bg-card-bg border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">แก้ไขแคมเปญ</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">ชื่อแคมเปญ *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="เช่น บ้านโป่ง ราชบุรี ครั้งที่ 1" className={inputCls} required />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">รายละเอียด</label>
            <textarea value={description}
              onChange={e => { setDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
              ref={el => { if (el && !el._init) { el._init = true; el.style.height = el.scrollHeight + 'px' } }}
              placeholder="บรรยายเพิ่มเติม..." className={inputCls} rows="4" style={{ resize: 'none', overflow: 'hidden' }} />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">จังหวัด</label>
            <select value={province} onChange={e => setProvince(e.target.value)} className={inputCls}>
              <option value="">-- ไม่ระบุ --</option>
              {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">วันจัดกิจกรรม</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <Link href="/calling"
              className="px-6 py-3 rounded-lg font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-center">
              ยกเลิก
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
