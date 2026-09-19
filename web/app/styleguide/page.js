import Button, { ButtonRow, IconButton } from '@/components/ui/Button'
import Input, { Label, Select } from '@/components/ui/Field'
import Card, { CardTitle, CardMeta, CardHoverActions } from '@/components/ui/Card'
import Badge, { BADGE_TONES } from '@/components/ui/Badge'
import { Trash2, Bell, Pencil } from 'lucide-react'

/**
 * /styleguide — หน้ารวมกฎการออกแบบของโปรเจกต์ (styleguide page / design system page)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ **หน้านี้ import primitive จริงจาก components/ui/ ไม่ได้ลอกคลาสมาแปะ**
 *    แก้ Button.jsx → หน้านี้เปลี่ยนตามทันที · ถ้าลอกมาแปะ วันหนึ่งหน้านี้จะโกหก
 *    (บทเรียนตรงกับเคสทดสอบ mobileAudit ที่เน่าเพราะอิงหน้าจริงที่ถูกแก้ไปแล้ว)
 *
 * ⚠️ **ยกเว้น i18n โดยตั้งใจ** — หน้านี้สำหรับ dev/designer ไม่ใช่ผู้ใช้ปลายทาง
 *    (ปกติ string ที่ผู้ใช้เห็นต้องผ่าน t() ตาม CLAUDE.md §i18n) จดไว้ที่ md/PENDING.md แล้ว
 *
 * ที่มาของตัวเลขทุกตัวในหน้านี้: md/rules/DESIGN.md (คลาส/สเกล) + md/rules/DESIGN.md (ตำแหน่ง/เหตุผล)
 * ห้ามเขียนกฎใหม่ที่นี่ — ถ้าเจอว่าขัดกัน ให้แก้ที่ md/ แล้วมาแก้ตาม
 */

export const metadata = { title: 'Styleguide' }

// ⚠️ `html { font-size: 18px }` (app/globals.css:22) — ทุกคลาสที่เป็น rem ใหญ่กว่าเอกสาร Tailwind 12.5%
//    ⇒ ห้ามลอกเลข px จากเอกสาร Tailwind มาใส่ที่นี่ ให้คำนวณจากค่าจริงตัวนี้เสมอ
const REM = 18
const px = (rem) => `${+(rem * REM).toFixed(2)}px`

function Section({ id, title, note, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-1">{title}</h2>
      {note && <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Swatch({ cls, name, value }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`h-9 w-9 shrink-0 rounded-lg border border-warm-200 dark:border-disc-border ${cls}`} />
      <span className="min-w-0">
        <span className="block text-sm text-warm-900 dark:text-disc-text truncate">{name}</span>
        <span className="block text-sm text-warm-500 dark:text-disc-muted truncate">{value}</span>
      </span>
    </div>
  )
}

const SWATCH_GRID = 'grid grid-cols-2 sm:grid-cols-3 gap-3'

export default function StyleguidePage() {
  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">Styleguide</h1>
      <p className="text-base text-warm-500 dark:text-disc-muted mt-1">
        ตัวอย่างจริงของ token + component ที่ใช้ทั้งโปรเจกต์ · ของทุกชิ้นในหน้านี้ import มาจาก{' '}
        <code className="text-sm">components/ui/</code> ไม่ใช่สำเนา
      </p>
      <p className="text-sm text-warm-500 dark:text-disc-muted mt-2">
        กฎฉบับเต็มอยู่ที่ <code className="text-sm">md/rules/DESIGN.md</code> (ใช้คลาสอะไร) และ{' '}
        <code className="text-sm">md/rules/DESIGN.md</code> (วางตรงไหน ทำไม) — หน้านี้ไม่ใช่แหล่งอ้างอิงใหม่
      </p>

      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 mt-4">
        <p className="text-base text-amber-900 dark:text-amber-200 font-medium">
          ⚠️ <code className="text-sm">html {'{ font-size: 18px }'}</code> — คลาส rem ทุกตัวใหญ่กว่าเอกสาร Tailwind 12.5%
        </p>
        <p className="text-sm text-amber-900 dark:text-amber-200 mt-1">
          <code className="text-sm">p-4</code> = {px(1)} ไม่ใช่ 16px · <code className="text-sm">w-64</code> = {px(16)} ไม่ใช่ 256px
          — คำนวณความกว้างด้วยเลขจากเอกสาร Tailwind = ผิดทุกครั้ง
        </p>
      </div>

      <hr className="my-8 border-warm-200 dark:border-disc-border" />

      {/* ── 1. สี ─────────────────────────────────────────────── */}
      <Section title="1 · สี" note="สีแบรนด์เก็บเป็น CSS var ใน globals.css — แก้ที่นั่นที่เดียวแล้วเปลี่ยนทั้งเว็บ">
        <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2">แบรนด์</h3>
        <div className={SWATCH_GRID}>
          <Swatch cls="bg-orange" name="orange" value="#ff6a13" />
          <Swatch cls="bg-orange-light" name="orange-light" value="#f37a2c" />
          <Swatch cls="bg-orange-dark" name="orange-dark" value="#df492e" />
          <Swatch cls="bg-brand-navy" name="navy" value="#002b49" />
          <Swatch cls="bg-brand-blue-light" name="blue-light" value="#b5d1dc" />
          <Swatch cls="bg-card-bg" name="card-bg" value="var(--card-bg)" />
        </div>

        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 mt-4">
          <p className="text-base text-red-900 dark:text-red-200 font-medium">⛔ กับดัก: <code className="text-sm">teal</code> ไม่ใช่สีเขียว</p>
          <p className="text-sm text-red-900 dark:text-red-200 mt-1">
            <code className="text-sm">teal.DEFAULT = var(--brand-orange)</code> = สีส้ม แต่ถูกใช้ 419 จุด (มากกว่าชื่อ{' '}
            <code className="text-sm">orange</code> ที่ 388 จุด) · ของใหม่ให้ใช้ <code className="text-sm">orange</code>
            {' '}จนกว่าจะล้างชื่อเก่าเสร็จ
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Swatch cls="bg-teal" name="bg-teal" value="= สีส้ม" />
            <Swatch cls="bg-orange" name="bg-orange" value="= สีส้ม (ชื่อถูก)" />
          </div>
        </div>

        <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2 mt-5">เทาอุ่น (warm) — โหมดสว่าง</h3>
        <div className={SWATCH_GRID}>
          <Swatch cls="bg-warm-50" name="warm-50" value="#f9f8f6" />
          <Swatch cls="bg-warm-100" name="warm-100" value="#f1ede4" />
          <Swatch cls="bg-warm-200" name="warm-200 (เส้นขอบ)" value="#e0ddd7" />
          <Swatch cls="bg-warm-400" name="warm-400" value="#b4b2a9" />
          <Swatch cls="bg-warm-500" name="warm-500 (ตัวรอง)" value="#6b6b64" />
          <Swatch cls="bg-warm-900" name="warm-900 (ตัวหลัก)" value="#1a1a1a" />
        </div>

        <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2 mt-5">โหมดมืด (disc) — ใช้ชุดนี้เท่านั้น</h3>
        <p className="text-sm text-warm-500 dark:text-disc-muted mb-2">
          วัด 2026-09-19: ใช้ไป 2,845 จุด ละเมิด 0 — กฎเดียวของโปรเจกต์ที่มีเครื่องบังคับ
        </p>
        <div className={SWATCH_GRID}>
          <Swatch cls="bg-disc-bg2" name="disc-bg2" value="#1e1e1e" />
          <Swatch cls="bg-disc-header" name="disc-header" value="#252526" />
          <Swatch cls="bg-disc-hover" name="disc-hover" value="#2a2d2e" />
          <Swatch cls="bg-disc-border" name="disc-border" value="#3e3e3e" />
          <Swatch cls="bg-[#d4d4d4]" name="disc-text" value="#d4d4d4" />
          <Swatch cls="bg-[#a8a8a8]" name="disc-muted" value="#a8a8a8" />
        </div>
      </Section>

      {/* ── 2. ตัวอักษร ───────────────────────────────────────── */}
      <Section
        title="2 · ตัวอักษร (type scale)"
        note={`ใช้ 5 ขนาดนี้เท่านั้นทั้งโปรเจกต์ · ขนาดจริงคำนวณจาก html = ${REM}px`}
      >
        <div className="space-y-3">
          {[
            ['text-2xl font-bold', 'หัวหน้าเพจ (h1)', 1.5],
            ['text-lg font-medium', 'หัวข้อกอง / หัว modal (h2)', 1.125],
            ['text-base font-semibold', 'ชื่อการ์ด / หัวข้อย่อย (h3)', 1],
            ['text-base', 'เนื้อความ · ปุ่ม · input · error — ค่าเริ่มต้นของทุกอย่าง', 1],
            ['text-sm', 'label ฟอร์ม · badge · hint — เล็กสุดของโปรเจกต์', 0.875],
          ].map(([cls, use, rem]) => (
            <div key={cls} className="border-b border-warm-200 dark:border-disc-border pb-3 last:border-0">
              <p className={`${cls} text-warm-900 dark:text-disc-text`}>ตัวอย่างข้อความภาษาไทย Aa Bb 123</p>
              <p className="text-sm text-warm-500 dark:text-disc-muted mt-1">
                <code className="text-sm">{cls}</code> = {px(rem)} · {use}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg px-4 py-3 mt-4">
          <p className="text-base text-warm-900 dark:text-disc-text">
            ❌ ห้าม <code className="text-sm">text-xs</code> ({px(0.75)}) และห้ามขนาดกำหนดเอง{' '}
            <code className="text-sm">text-[13px]</code>
          </p>
          <p className="text-sm text-warm-500 dark:text-disc-muted mt-1">
            หนี้ปัจจุบัน: <code className="text-sm">text-xs</code> ยังค้างอยู่ 403 จุด · ขนาดกำหนดเอง 16 จุด
          </p>
        </div>
      </Section>

      {/* ── 3. ระยะ + มุม ─────────────────────────────────────── */}
      <Section title="3 · ระยะห่าง และมุมโค้ง" note="ตัวเลขข้างล่างคือ px จริงบนเว็บนี้ ไม่ใช่ค่าจากเอกสาร Tailwind">
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <div key={n} className="text-center">
              <div className="bg-orange/20 rounded" style={{ width: px(n * 0.25), height: px(n * 0.25) }} />
              <p className="text-sm text-warm-500 dark:text-disc-muted mt-1">
                {n} = {px(n * 0.25)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-5">
          <div>
            <div className="h-16 w-16 bg-warm-100 dark:bg-disc-hover rounded-lg border border-warm-200 dark:border-disc-border" />
            <p className="text-sm text-warm-900 dark:text-disc-text mt-1">rounded-lg = {px(0.5)}</p>
            <p className="text-sm text-warm-500 dark:text-disc-muted">การ์ด · ปุ่ม · input</p>
          </div>
          <div>
            <div className="h-16 w-16 bg-warm-100 dark:bg-disc-hover rounded-full border border-warm-200 dark:border-disc-border" />
            <p className="text-sm text-warm-900 dark:text-disc-text mt-1">rounded-full</p>
            <p className="text-sm text-warm-500 dark:text-disc-muted">ป้าย · ชิป · avatar</p>
          </div>
          <div>
            <div className="h-16 w-16 bg-warm-100 dark:bg-disc-hover rounded-xl border-2 border-dashed border-red-400" />
            <p className="text-sm text-warm-900 dark:text-disc-text mt-1">❌ rounded-xl</p>
            <p className="text-sm text-warm-500 dark:text-disc-muted">ห้ามใช้กับการ์ด (ค้าง 160 จุด)</p>
          </div>
        </div>
      </Section>

      {/* ── 4. ปุ่ม ───────────────────────────────────────────── */}
      <Section title="4 · ปุ่ม" note="ปุ่มข้อความมีขนาดเดียวคือ px-4 py-2 text-base — ข้อยกเว้นเดียวคือการ์ด /kanban">
        {/* แถวนี้ตั้งใจให้ปุ่มกว้างตามข้อความ เพื่อให้เห็นแต่ละ variant — ไม่ใช่แถบปุ่มสั่งงานจริง
            ⇒ ประกาศยกเว้นกฎ ragged ของ mobileAudit ไว้ตรงนี้ (นี่คือวิธีใช้ data-audit-ok ที่ถูกต้อง:
            ปิดเสียงเป็นรายจุดพร้อมเหตุผล ไม่ใช่ปิดทั้งกฎ) */}
        <div className="flex flex-wrap items-center gap-2" data-audit-ok="ragged">
          <Button>ปุ่มหลัก</Button>
          <Button variant="secondary">ปุ่มรอง</Button>
          <Button disabled>ปิดใช้งาน</Button>
          <Button size="sm" variant="secondary">sm — การ์ด kanban เท่านั้น</Button>
        </div>
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-2">
          แถวข้างบนติด <code className="text-sm">data-audit-ok=&quot;ragged&quot;</code> ไว้ — เป็นแถวตัวอย่าง
          ไม่ใช่แถบปุ่มจริง จึงยกเว้นกฎ ragged ของ <code className="text-sm">mobileAudit</code> เป็นรายจุด
        </p>

        <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text mt-5 mb-2">ปุ่มไอคอน</h3>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton aria-label="แก้ไข"><Pencil size={16} /></IconButton>
          <IconButton aria-label="แจ้งเตือน"><Bell size={16} /></IconButton>
          <IconButton aria-label="ลบ" tone="danger"><Trash2 size={16} /></IconButton>
        </div>
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-2">
          ปุ่มทำลายเป็นเทาก่อน แดงตอน hover เท่านั้น — การ์ด 20 ใบเป็นถังขยะแดง 20 อัน คือหน้าจอที่ตะโกนใส่คนใช้
          · ทุกปุ่มไอคอนต้องมี <code className="text-sm">aria-label</code> (primitive เตือนใน console ถ้าลืม)
        </p>

        <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text mt-5 mb-2">แถวปุ่ม — ย่อจอดูได้</h3>
        <p className="text-sm text-warm-500 dark:text-disc-muted mb-2">
          มือถือ: เต็มความกว้างเรียงลง · จอกว้าง: แถวปกติ — <code className="text-sm">mobileAudit</code> จับแถวที่ผิดด้วยกฎ ragged
        </p>
        <ButtonRow>
          <Button variant="secondary">คัดลอกรายการโอน</Button>
          <Button variant="secondary">ดาวน์โหลด CSV</Button>
          <Button>ปิดรอบ</Button>
        </ButtonRow>
      </Section>

      {/* ── 5. ฟอร์ม ─────────────────────────────────────────── */}
      <Section title="5 · ฟอร์ม" note={`ช่องกรอกสูง h-11 = ${px(2.75)} · label เป็น text-sm`}>
        <div className="max-w-sm">
          <Label htmlFor="sg-name">ชื่อรอบ</Label>
          <Input id="sg-name" placeholder="พิมพ์ชื่อรอบ…" readOnly />
          <div className="mt-3">
            <Label htmlFor="sg-acc">บัญชีต้นทาง</Label>
            <Select id="sg-acc" defaultValue="a">
              <option value="a">บัญชีจังหวัด (หลัก) ราชบุรี</option>
            </Select>
          </div>
        </div>
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-2">
          กล่องข้อความยาวใช้ <code className="text-sm">components/ui/Textarea</code> ที่ยืดตามเนื้อหาเสมอ —
          ห้ามใช้ <code className="text-sm">rows={'{8}'}</code> + scroll ข้างใน
        </p>
      </Section>

      {/* ── 6. ป้ายสถานะ ─────────────────────────────────────── */}
      <Section title="6 · ป้ายสถานะ" note="สีผูกกับความหมาย ไม่ผูกกับชื่อ status ใน DB">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>{tone}</Badge>
          ))}
        </div>
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-2">
          ร่าง/ว่าง = idle · กำลังทำ = active · รอคน = wait · เสร็จ = done · ปิดแล้ว = closed ·
          ⚠️ <code className="text-sm">done</code> ออกมาเป็นสีส้มเพราะ token ชื่อ teal (ดูข้อ 1)
        </p>
      </Section>

      {/* ── 7. การ์ด ─────────────────────────────────────────── */}
      <Section title="7 · กายวิภาคการ์ด" note="ลำดับบรรทัดตายตัว — ชื่อได้ความกว้างก่อน ปุ่มได้ทีหลัง">
        <Card hover className="px-3 py-2 max-w-md">
          <CardHoverActions>
            <IconButton size="card" aria-label="ลบรอบจ่าย" tone="danger"><Trash2 size={16} /></IconButton>
          </CardHoverActions>
          <CardTitle reserveButton>ผู้บริหารท้องถิ่นและระบบเรื่องร้องเรียน</CardTitle>
          <CardMeta>บัญชีจังหวัด (หลัก) ราชบุรี · ราชบุรี</CardMeta>
          <CardMeta className="mt-0.5">
            2 คน · 800 บาท
            <Badge tone="wait" inline>โอนครบ · รอแจ้ง</Badge>
          </CardMeta>
        </Card>
        <ul className="text-sm text-warm-500 dark:text-disc-muted mt-3 space-y-1">
          <li>• บรรทัด 1 = ชื่ออย่างเดียว <code className="text-sm">truncate</code> · ปุ่มลบลอย absolute ไม่กินความกว้าง</li>
          <li>• บรรทัด 3 = ป้ายสถานะต่อท้ายบรรทัดตัวเลข (ที่ว่างที่ไม่มีใครใช้ ไม่กินความสูงเพิ่ม)</li>
          <li>• ปุ่มลบซ่อนด้วย <code className="text-sm">[@media(hover:hover)]:</code> ไม่ใช่ <code className="text-sm">sm:</code> — บนจอสัมผัสต้องโชว์ถาวร</li>
        </ul>
      </Section>

      {/* ── 8. โหมดมืด ───────────────────────────────────────── */}
      <Section
        title="8 · เทียบโหมดมืด"
        note="กล่องที่สองบังคับ class dark ไว้ — ดูโหมดมืดได้โดยไม่ต้องสลับธีมทั้งเว็บ"
      >
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 mb-3">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            ⚠️ <strong>บังคับได้ทางเดียวเท่านั้น</strong> — Tailwind ตั้งค่า <code className="text-sm">darkMode: &apos;class&apos;</code>
            {' '}ซึ่งแปลเป็น CSS ว่า <code className="text-sm">.dark ...</code> ⇒ เติม <code className="text-sm">class=&quot;dark&quot;</code>
            {' '}ให้กล่องข้างในได้ แต่ <strong>ปลดของบรรพบุรุษจากข้างในไม่ได้</strong>
            {' '}· ถ้าตอนนี้คุณดูเว็บในโหมดมืดอยู่ สองกล่องข้างล่างจะเหมือนกัน — สลับธีมเป็นสว่างแล้วดูอีกที
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[false, true].map((isDark) => (
            <div key={String(isDark)} className={isDark ? 'dark' : ''}>
              <div className="rounded-lg border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-bg2 p-3">
                <p className="text-sm text-warm-500 dark:text-disc-muted mb-2">
                  {isDark ? 'บังคับ class="dark"' : 'ธีมที่คุณกำลังดูอยู่'}
                </p>
                <Card className="px-3 py-2">
                  <CardTitle>ชื่อการ์ดตัวอย่าง</CardTitle>
                  <CardMeta>รายละเอียดรอง</CardMeta>
                  <CardMeta className="mt-0.5">
                    800 บาท
                    <Badge tone="done" inline>เสร็จ</Badge>
                  </CardMeta>
                </Card>
                <ButtonRow cols={2} className="mt-3">
                  <Button>ปุ่มหลัก</Button>
                  <Button variant="secondary">ปุ่มรอง</Button>
                </ButtonRow>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 9. หนี้ ──────────────────────────────────────────── */}
      <Section title="9 · หนี้ที่ยังไม่ตรงกฎ (วัด 2026-09-19)" note="ตัวเลขจาก grep ทั้ง app/ + components/ — อัปเดตเมื่อไล่แก้แล้ว">
        <div className="overflow-x-auto">
          <table className="text-base w-full">
            <thead>
              <tr className="text-left text-warm-500 dark:text-disc-muted border-b border-warm-200 dark:border-disc-border">
                <th className="py-2 pr-4 font-medium">กฎ</th>
                <th className="py-2 font-medium">ยังค้าง</th>
              </tr>
            </thead>
            <tbody className="text-warm-900 dark:text-disc-text">
              {[
                ['ห้าม text-xs', '403 จุด'],
                ['การ์ดห้าม rounded-xl', '160 จุด'],
                ['ปุ่มขนาดเดียว px-4 py-2 text-base', 'ปุ่มนอกสเกล 51 จุด · คลาสปุ่มไม่ซ้ำกัน 92 แบบ'],
                ['ห้ามขนาดกำหนดเอง text-[NNpx]', '16 จุด'],
                ['token ชื่อ teal ที่จริงเป็นสีส้ม', '419 จุด'],
                ['dark: ใช้ชุด disc-* เท่านั้น', '0 จุด ✅'],
              ].map(([rule, debt]) => (
                <tr key={rule} className="border-b border-warm-200 dark:border-disc-border last:border-0">
                  <td className="py-2 pr-4">{rule}</td>
                  <td className="py-2">{debt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
