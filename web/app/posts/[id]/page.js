import Link from 'next/link'
import PostEditor from '@/components/posts/PostEditor.jsx'
import PostMediaPanel from '@/components/posts/PostMediaPanel.jsx'
import PostMetaPanel from '@/components/posts/PostMetaPanel.jsx'
import PostPublishPanel from '@/components/posts/PostPublishPanel.jsx'

export default async function PostDetailPage({ params }) {
  const { id } = await params

  return (
    <div>
      <Link href="/posts" className="inline-block text-base text-teal hover:underline mb-4">
        ← กลับไปหน้ารายการ
      </Link>

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
