import { getTranslations } from 'next-intl/server'
import { postContext } from '@/lib/postsGuard.js'
import PostEditor from '@/components/posts/PostEditor.jsx'
import PostMediaPanel from '@/components/posts/PostMediaPanel.jsx'
import PostMetaPanel from '@/components/posts/PostMetaPanel.jsx'
import PostPublishPanel from '@/components/posts/PostPublishPanel.jsx'

/**
 * ชื่อแท็บ = ชื่อโพสต์ (เหมือน /docs/[id] ที่ใช้ชื่ออีเวนต์)
 * ⚠️ ต้องผ่าน postContext เสมอ — ชื่อร่าง `personal` ของคนอื่นห้ามหลุดออกทาง <title>
 *    ไม่มีสิทธิ์/ไม่มีโพสต์ → ใช้ชื่อกลางๆ ไม่ยืนยันว่ามีอยู่จริง
 */
export async function generateMetadata({ params }) {
  const { id } = await params
  const t = await getTranslations('posts')
  const ctx = await postContext(id)
  return { title: (!ctx.error && ctx.post?.title?.trim()) || t('meta.detail') }
}

export default async function PostDetailPage({ params }) {
  const { id } = await params

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5">
          <PostEditor id={id} />
        </div>
        {/* คอลัมน์ขวา 3 การ์ด — สื่อ (บนสุด) · รายละเอียด · เผยแพร่
            กริดในรางนี้แคบ (360px) จึงส่ง compact + มี lightbox กดดูรูปเต็มได้ */}
        <div className="flex flex-col gap-6">
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5">
            <PostMediaPanel id={id} compact />
          </div>
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5">
            <PostMetaPanel id={id} />
          </div>
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5">
            <PostPublishPanel postId={id} />
          </div>
        </div>
      </div>
    </div>
  )
}
