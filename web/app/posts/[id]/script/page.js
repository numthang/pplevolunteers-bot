import { getTranslations } from 'next-intl/server'
import { postContext } from '@/lib/postsGuard.js'
import ScriptTeleprompter from '@/components/posts/ScriptTeleprompter.jsx'

/**
 * ชื่อแท็บ = ชื่อโพสต์ (ทรงเดียวกับ /posts/[id])
 * ⚠️ ต้องผ่าน postContext เสมอ — ชื่อร่าง `personal` ของคนอื่นห้ามหลุดออกทาง <title>
 */
export async function generateMetadata({ params }) {
  const { id } = await params
  const t = await getTranslations('posts.script')
  const ctx = await postContext(id)
  return { title: (!ctx.error && ctx.post?.title?.trim()) || t('metaTitle') }
}

/**
 * หน้าอ่านบทพูด — เต็มความกว้าง ไม่มีคอลัมน์ขวาเหมือนหน้าแก้โพสต์
 * (จอนี้ถูกอ่านจากระยะ 1-2 เมตร ทุกพิกเซลที่เสียไปกับการ์ดข้างๆ คือตัวอักษรที่เล็กลง)
 */
export default async function PostScriptPage({ params }) {
  const { id } = await params

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-5">
      <ScriptTeleprompter id={id} />
    </div>
  )
}
