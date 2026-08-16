import Link from 'next/link'
import { getSession } from '@/lib/auth.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getBotGuildStatus } from '@/db/botStatus.js'
import BotChannelSettings from '@/components/bot/BotChannelSettings.jsx'

export const metadata = { title: 'ภาพรวม' }

// หน้าแรกของ /bot — เดิมไม่มี เลยเด้งไป /bot/platforms มั่วๆ (2026-08-09)
// เจตนา: ตอบ "เซิร์ฟเวอร์นี้ตั้งครบหรือยัง" ในหน้าเดียว ไม่ใช่กริดการ์ดลิงก์ (sidebar ทำหน้าที่นั้นแล้ว)
export default async function BotHomePage() {
  const session = await getSession()
  const guildId = await getGuildId(session)
  const status  = await getBotGuildStatus(guildId)

  // layout ข้างนอกกันเคส "org ไม่มี guild" ไว้แล้ว — ที่มาถึงตรงนี้ได้แต่ status ว่าง
  // แปลว่า guild ที่เลือกไม่มีใน dc_guilds (เช่น guild กำพร้าที่ยังไม่ผูก org)
  if (!status) {
    return (
      <div className="rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg p-8 text-center">
        <p className="text-sm text-warm-500 dark:text-disc-muted">
          ไม่พบข้อมูลเซิร์ฟเวอร์นี้ในระบบ — ลองสลับเซิร์ฟเวอร์ที่แถบด้านบน
        </p>
      </div>
    )
  }

  const { guild, roles, channels, aiMention, socialAccounts } = status

  // แสดงเฉพาะข้อที่ยังค้างจริง — ตั้งครบแล้วต้องไม่มีรายการโผล่ ไม่ใช่โชว์ติ๊กถูกเต็มหน้า
  const todos = []
  if (roles.total > 0 && roles.with_permission === 0) {
    todos.push({
      href: '/bot/roles',
      text: `ยศทั้ง ${roles.total} อันยังไม่ได้ผูกสิทธิ์เลย — คนในเซิร์ฟเวอร์นี้จึงยังไม่มีสิทธิ์อะไรในระบบ`,
    })
  } else if (roles.total > 0 && roles.with_permission < roles.total) {
    todos.push({
      href: '/bot/roles',
      text: `ผูกสิทธิ์แล้ว ${roles.with_permission} จาก ${roles.total} ยศ`,
    })
  }
  if (roles.total > 0 && roles.with_scope === 0) {
    todos.push({ href: '/bot/roles', text: 'ยังไม่มียศไหนผูกพื้นที่ — ระบบจะกรองข้อมูลตามจังหวัด/เขตไม่ได้' })
  }
  if (!channels.news_channel_id) {
    todos.push({ href: '#channels', text: 'ยังไม่ได้ตั้งห้องข่าวสาร — โพสต์จะแชร์ลง Discord ไม่ได้' })
  }
  if (!channels.social_alert_channel_id) {
    todos.push({ href: '#channels', text: 'ยังไม่ได้ตั้งห้องแจ้งเตือน token — จะไม่มีใครรู้ตอนบัญชีโซเชียลหมดอายุ' })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500 dark:text-disc-muted min-w-0">
        ตั้งค่าที่ผูกกับเซิร์ฟเวอร์ Discord นี้โดยเฉพาะ ·{' '}
        <Link href="/org/settings" className="text-orange hover:underline">ตั้งค่าระดับองค์กรอยู่อีกที่</Link>
      </p>

      {todos.length > 0 ? (
        <div className="rounded-xl border border-orange/30 bg-orange/5 dark:bg-orange/10 p-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-disc-text mb-2">ยังไม่ได้ตั้ง</p>
          <ul className="flex flex-col gap-1.5">
            {todos.map((t, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-disc-text">
                <Link href={t.href} className="text-orange hover:underline">{t.text}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <p className="text-sm text-gray-700 dark:text-disc-text">ตั้งค่าครบแล้ว 🎉</p>
        </div>
      )}

      <div id="channels" className="scroll-mt-4">
        <BotChannelSettings guildId={guild.guild_id} initial={channels} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="ยศที่ผูกสิทธิ์" value={`${roles.with_permission} / ${roles.total}`} href="/bot/roles" />
        <Stat label="AI ตอบเมื่อถูก mention" value={aiMention ? 'เปิด' : 'ปิด'} href="/bot/ai" />
        <Stat label="บัญชีโซเชียลที่ผูกเซิร์ฟเวอร์นี้" value={socialAccounts} href="/org/settings/social" />
      </div>
    </div>
  )
}

function Stat({ label, value, href }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg p-4 hover:border-orange transition-colors"
    >
      <p className="text-xs text-gray-400 dark:text-disc-muted">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-disc-text mt-0.5">{value}</p>
    </Link>
  )
}
