
export const metadata = { title: 'Integrations' }

const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_BOT_CLIENT_ID}&permissions=1394003710544&scope=bot+applications.commands`
const API_BASE = process.env.NEXTAUTH_URL || 'https://pplethai.org'

function Section({ title, children, id }) {
  return (
    <div id={id} className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-xl p-6">
      <p className="text-xl font-bold text-brand-orange mb-4">{title}</p>
      {children}
    </div>
  )
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-warm-100 dark:bg-disc-hover text-warm-900 dark:text-disc-text text-xs rounded-lg p-4 overflow-x-auto leading-relaxed">
      {children}
    </pre>
  )
}

function Badge({ children, color = 'green' }) {
  const colors = {
    green:  'bg-green-100  dark:bg-green-900/30  text-green-700  dark:text-green-400',
    blue:   'bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${colors[color]}`}>
      {children}
    </span>
  )
}

export default async function IntegrationsPage() {

  return (
    <div className="space-y-3">

      <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-xl px-6 py-5">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">Integrations</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted mt-1">เชื่อมต่อ PPLE Volunteers กับระบบภายนอก</p>
      </div>

      {/* Discord Bot */}
      <Section title="Discord Bot" id="discord-bot">
        <p className="text-base text-warm-500 dark:text-disc-muted mb-4">
          เพิ่ม PPLE Bot เข้า Discord Server ของคุณ — รองรับ slash commands, role management และ QR login
        </p>
        <div className="flex flex-wrap gap-3 mb-5">
          <a
            href={BOT_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-base font-semibold text-white bg-brand-orange hover:bg-brand-orange-light px-4 py-2 rounded-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
            </svg>
            Add to Server
          </a>
        </div>

        {/* Bot Commands */}
        <div className="border-t border-brand-blue-light dark:border-disc-border pt-4 mb-5">
          <p className="text-base font-semibold text-warm-500 dark:text-disc-muted mb-3">คำสั่งทั้งหมด</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              {
                group: 'Member Onboarding', desc: 'ลงทะเบียน เลือกจังหวัด และความสนใจ',
                commands: [
                  ['/panel register', 'วางปุ่มลงทะเบียน — กรอกชื่อ ความสนใจ และที่อยู่'],
                  ['/panel province',  'วางปุ่มเลือก role จังหวัด แบ่งตามภาค 6 ภาค'],
                  ['/panel interest',  'วางปุ่มเลือก role ความสนใจและความถนัด'],
                ],
              },
              {
                group: 'Activity & Stats', desc: 'สถิติกิจกรรม คะแนน และ ranking',
                commands: [
                  ['/stat',         'สถิติกิจกรรมส่วนตัว (messages, voice, mentions)'],
                  ['/rate',         'ให้คะแนน rating สมาชิก'],
                  ['/user rating',  'ดูคะแนน rating ของสมาชิก'],
                  ['/user ranking', 'Top rating ตาม role'],
                ],
              },
              {
                group: 'Organization', desc: 'โครงสร้างองค์กรและ orgchart',
                commands: [
                  ['/orgchart',       'ดูโครงสร้างองค์กรแบบ interactive'],
                  ['/panel orgchart', 'วาง orgchart panel พร้อม top members'],
                ],
              },
              {
                group: 'Finance', desc: 'แดชบอร์ดการเงินและบัญชี',
                commands: [
                  ['/panel finance',      'ตั้งค่า dashboard การเงินแบบ real-time ใน channel'],
                  ['/panel finance-list', 'แสดงรายชื่อบัญชีการเงินทั้งหมด'],
                ],
              },
              {
                group: 'Forum', desc: 'ค้นหาและจัดการ forum channel',
                commands: [
                  ['/panel forum', 'ตั้งค่า forum channel พร้อม dashboard ค้นหาโพสต์'],
                ],
              },
              {
                group: 'Events', desc: 'ลงชื่อสนใจเข้าร่วมกิจกรรม',
                commands: [
                  ['/panel gogo', 'สร้าง panel ลงชื่อสนใจเข้าร่วมกิจกรรม'],
                ],
              },
              {
                group: 'Admin Tools', desc: 'จัดการ server (เฉพาะ Admin)',
                commands: [
                  ['/server stat',     'สถิติรวม server ย้อนหลัง N วัน'],
                  ['/server backup',   'Backup ข้อมูล server ทั้งหมดลงไฟล์ JSON'],
                  ['/server guide',    'แสดงรายการห้องทั้งหมดจาก backup ล่าสุด'],
                  ['/server autorole', 'ตั้ง role อัตโนมัติให้สมาชิกใหม่'],
                  ['/server welcome',  'ตั้งข้อความ DM ต้อนรับสมาชิกใหม่'],
                ],
              },
              {
                group: 'Utilities', desc: 'เครื่องมือสำหรับ Moderator',
                commands: [
                  ['/case',            'จัดการเคสร้องเรียน (list / view / update)'],
                  ['/channel cleanup', 'ลบข้อความใน channel (1–100 ข้อความ)'],
                  ['/sticky',          'ปักหมุดข้อความ — re-post อัตโนมัติทุกครั้งที่มีคนพูด'],
                  ['/message',         'ดึง export ข้อความ หรือส่งแบบ anonymous'],
                  ['/user dm',         'Broadcast DM ไปยังสมาชิกตาม role'],
                  ['/record',          'เริ่ม/หยุดบันทึก activity log ของห้อง'],
                ],
              },
            ].map(({ group, desc, commands }) => (
              <div key={group} className="bg-warm-50 dark:bg-disc-hover rounded-lg p-3">
                <p className="text-base font-semibold text-warm-900 dark:text-disc-text">{group}</p>
                <p className="text-sm text-warm-500 dark:text-disc-muted mb-2">{desc}</p>
                <div className="space-y-1">
                  {commands.map(([cmd, cmdDesc]) => (
                    <div key={cmd} className="flex items-baseline gap-2">
                      <code className="shrink-0 text-sm bg-warm-200 dark:bg-disc-bg text-warm-700 dark:text-disc-muted px-1.5 py-0.5 rounded">{cmd}</code>
                      <span className="text-sm text-warm-500 dark:text-disc-muted">{cmdDesc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-brand-blue-light dark:border-disc-border pt-4">
          <p className="text-base font-semibold text-warm-500 dark:text-disc-muted mb-2">Permissions ที่ขอ</p>
          <div className="flex flex-wrap gap-2">
            {['Manage Roles', 'Manage Messages', 'Manage Channels', 'Moderate Members', 'Manage Threads', 'Send Messages', 'Embed Links', 'Read Message History'].map(p => (
              <Badge key={p} color="blue">{p}</Badge>
            ))}
          </div>
        </div>
      </Section>

      {/* API Access */}
      <Section title="API Access" id="api-access">
        <p className="text-base text-warm-500 dark:text-disc-muted mb-5">
          REST API สำหรับระบบภายนอกที่ต้องการดึงข้อมูลจาก PPLE Volunteers
        </p>

        {/* Auth */}
        <div className="mb-5">
          <p className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2">Authentication</p>
          <p className="text-base text-warm-500 dark:text-disc-muted mb-2">แนบ API key ใน header ทุก request</p>
          <CodeBlock>{`Authorization: Bearer <PPLEVOLUNTEERS_API_KEY>`}</CodeBlock>
        </div>

        {/* Endpoints */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge color="green">GET</Badge>
              <code className="text-base font-mono text-warm-900 dark:text-disc-text">/api/v1/calling/logs</code>
            </div>
            <p className="text-base text-warm-500 dark:text-disc-muted mb-3">ดึง calling logs ของ member จาก ngs source_id</p>

            <p className="text-base font-semibold text-warm-500 dark:text-disc-muted mb-1">Query Parameters</p>
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-brand-blue-light dark:border-disc-border">
                    <th className="text-left py-1.5 pr-4 text-warm-500 dark:text-disc-muted font-medium">Parameter</th>
                    <th className="text-left py-1.5 pr-4 text-warm-500 dark:text-disc-muted font-medium">Type</th>
                    <th className="text-left py-1.5 pr-4 text-warm-500 dark:text-disc-muted font-medium">Required</th>
                    <th className="text-left py-1.5 text-warm-500 dark:text-disc-muted font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-brand-blue-light dark:border-disc-border">
                    <td className="py-1.5 pr-4 font-mono text-warm-900 dark:text-disc-text">member_id</td>
                    <td className="py-1.5 pr-4 text-warm-500 dark:text-disc-muted">integer</td>
                    <td className="py-1.5 pr-4"><Badge color="orange">required</Badge></td>
                    <td className="py-1.5 text-warm-500 dark:text-disc-muted">ngs_member source_id</td>
                  </tr>
                  <tr className="border-b border-brand-blue-light dark:border-disc-border">
                    <td className="py-1.5 pr-4 font-mono text-warm-900 dark:text-disc-text">limit</td>
                    <td className="py-1.5 pr-4 text-warm-500 dark:text-disc-muted">integer</td>
                    <td className="py-1.5 pr-4 text-warm-500 dark:text-disc-muted">optional</td>
                    <td className="py-1.5 text-warm-500 dark:text-disc-muted">จำนวนผลลัพธ์ (default 100, max 500)</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-mono text-warm-900 dark:text-disc-text">offset</td>
                    <td className="py-1.5 pr-4 text-warm-500 dark:text-disc-muted">integer</td>
                    <td className="py-1.5 pr-4 text-warm-500 dark:text-disc-muted">optional</td>
                    <td className="py-1.5 text-warm-500 dark:text-disc-muted">pagination offset (default 0)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-base font-semibold text-warm-500 dark:text-disc-muted mb-1">Example Request</p>
            <CodeBlock>{`curl -H "Authorization: Bearer <key>" \\
  "${API_BASE}/api/v1/calling/logs?member_id=123"`}</CodeBlock>

            <p className="text-base font-semibold text-warm-500 dark:text-disc-muted mt-3 mb-1">Example Response</p>
            <CodeBlock>{`{
  "data": [
    {
      "id": 1,
      "campaign_id": 2,
      "member_id": 123,
      "contact_type": "member",
      "status": "answered",
      "sig_overall": 4,
      "sig_interest": 5,
      "note": "สนใจร่วมงาน",
      "called_at": "2026-05-10T14:30:00.000Z"
    }
  ],
  "meta": { "member_id": 123, "count": 1 }
}`}</CodeBlock>
          </div>
        </div>
      </Section>

    </div>
  )
}
