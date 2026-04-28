'use client'

import { useState } from 'react'
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

const inputCls = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function CreateCampaignPage() {
  const router = useRouter()
  const [campaignId, setCampaignId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [province, setProvince] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name) { alert('กรุณาใส่ชื่อแคมเปญ'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/calling/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaignId ? Number(campaignId) : null, name, description, province: province || null, event_date: eventDate || null })
      })
      if (!res.ok) throw new Error('Failed to create campaign')
      const data = await res.json()
      router.push(`/calling/${data.data.id}`)
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Link href="/calling" className="text-teal hover:underline mb-6 block text-base">
        ← กลับ
      </Link>

      <div className="max-w-2xl bg-card-bg border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">สร้างแคมเปญการโทรใหม่</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
              Campaign ID <span className="font-normal text-gray-400">(ไม่ระบุ = อัตโนมัติ)</span>
            </label>
            <input type="number" value={campaignId} onChange={e => setCampaignId(e.target.value)}
              placeholder="เช่น 1234" className={inputCls} min="1" />
          </div>

          <div>
            <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-gray-300">ชื่อแคมเปญ *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="เช่น บ้านโป่ง ราชบุรี ครั้งที่ 1" className={inputCls} required />
          </div>

          <div>
            <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-gray-300">รายละเอียด</label>
            <textarea value={description}
              onChange={e => { setDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
              placeholder="บรรยายเพิ่มเติม..." className={inputCls} rows="4" style={{ resize: 'none', overflow: 'hidden' }} />
          </div>

          <div>
            <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-gray-300">จังหวัด</label>
            <select value={province} onChange={e => setProvince(e.target.value)} className={inputCls}>
              <option value="">-- ไม่ระบุ --</option>
              {[...PROVINCES].sort((a, b) => a.localeCompare(b, 'th')).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-gray-300">วันจัดกิจกรรม</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg text-base font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
            {loading ? 'กำลังสร้าง...' : 'สร้างแคมเปญ'}
          </button>
        </form>
      </div>
    </div>
  )
}
