/**
 * ดึงเบอร์จากทะเบียนพรรค (cache_pple_member) ใส่ users.phone + phone_verified_at
 * เพื่อให้อาสาที่ได้เบี้ยเลี้ยง login เว็บด้วย OTP ได้ · พร้อมเติม users.firstname จาก account_holder
 *
 * กลุ่มเป้าหมาย: user ที่มี org_members.account_holder (ชื่อจริงจากไฟล์บัญชีธนาคาร — ดู scripts/finance/backfillBankInfo.mjs)
 *
 * ⚠️ account_holder ส่วนใหญ่มีแค่ชื่อต้น (prod 2026-09-18: 63/66) → จับคู่ด้วยชื่ออย่างเดียวเสี่ยงผิดคน
 *    ใส่เบอร์คนแปลกหน้า + verified = คนนั้น OTP เข้าบัญชีอาสาได้ (เห็นเลขบัญชีด้วย) จึงแบ่ง 2 ระดับ:
 *    - strong: users.firstname+lastname ตรง full_name เป๊ะ และทะเบียนมีชื่อนี้คนเดียว → อัปเดตได้เลย
 *    - weak:   ชื่อต้นใน account_holder ตรงสมาชิก home_province ราชบุรี คนเดียว → ต้องคนยืนยันผ่าน --confirm เท่านั้น
 *
 * ไม่แตะ: user ที่ยืนยันเบอร์แล้ว · user ที่มีเบอร์ (ยังไม่ยืนยัน) คนละเบอร์กับทะเบียน · เบอร์ที่ user อื่นยืนยันไว้แล้ว
 *        (uq_users_phone) · เบอร์ที่ชนกันเองในชุดนี้ · firstname ที่มีค่าอยู่แล้ว
 *
 * ⚠️ scripts/ ไม่ใช่ migration — รันซ้ำได้ (คนที่ทำไปแล้วจะกลายเป็น "ยืนยันเบอร์แล้ว" แล้วถูกข้ามเอง)
 *
 * รัน (บน prod ห่อ sudo -u www bash -c "…"):
 *   node --import ./scripts/smoke/_envload.mjs scripts/members/syncPhoneFromRegistry.mjs                        # dry-run
 *   … --review-out /tmp/phone-review.xlsx      ออกไฟล์รายชื่อ weak ให้คนตรวจ (ห้ามเข้า git — มีชื่อจริง)
 *   … --confirm 12,34,56                        user_id ของ weak ที่ตรวจแล้วว่าใช่คนเดียวกัน
 *   … --pick 12:4455,34:9876                    ชื่อต้นซ้ำ/ไม่พบในจังหวัด → user_id:source_id ที่เลือกจากชีต pick
 *   … --apply                                   เขียนจริง
 *   … --org 1  --province ราชบุรี
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const pg = require('pg')

const args = process.argv.slice(2)
const flagValue = flag => (args.includes(flag) ? String(args[args.indexOf(flag) + 1] ?? '') : '')
const APPLY = args.includes('--apply')
const ORG_ID = Number(flagValue('--org')) || 1
const PROVINCE = flagValue('--province') || 'ราชบุรี'
const REVIEW_OUT = flagValue('--review-out')
const CONFIRMED = new Set(flagValue('--confirm').split(',').map(s => Number(s.trim())).filter(Boolean))
// ชื่อต้นซ้ำ/ไม่พบในจังหวัด → คนเลือกผู้สมัครจากไฟล์ตรวจ: --pick <user_id>:<source_id>,…
const PICKS = new Map(flagValue('--pick').split(',').map(s => s.split(':').map(Number)).filter(([u, m]) => u && m))
const MAX_CANDIDATES = 15

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

const TITLE = /^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*/
const clean = s => String(s ?? '').trim().replace(TITLE, '').replace(/\s+/g, ' ')
const key = s => clean(s).replace(/\s/g, '').toLowerCase()
const firstToken = s => clean(s).split(' ')[0] || ''

function normPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('66')) d = '0' + d.slice(2)
  return /^0[689]\d{8}$/.test(d) ? d : null
}
const mask = p => (p ? `${p.slice(0, 2)}x-xxx-${p.slice(6)}` : '')

// ── โหลดข้อมูล ───────────────────────────────────────────────────────────
const { rows: holderRows } = await pool.query(
  `SELECT om.user_id, om.account_holder, u.username, u.firstname, u.lastname, u.phone, u.phone_verified_at
     FROM org_members om JOIN users u ON u.id = om.user_id
    WHERE om.org_id = $1 AND om.account_holder IS NOT NULL AND TRIM(om.account_holder) <> ''
    ORDER BY om.user_id`,
  [ORG_ID]
)
const { rows: registry } = await pool.query(
  `SELECT source_id, full_name, mobile_number, home_province FROM cache_pple_member WHERE org_id = $1`,
  [ORG_ID]
)
const { rows: verifiedRows } = await pool.query(
  `SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL`
)
const verifiedOwner = new Map(verifiedRows.map(r => [r.phone, r.id]))

// org_members มีแถวละ guild → รวมเป็น 1 คน
const users = new Map()
for (const r of holderRows) {
  const u = users.get(r.user_id) || { ...r, holders: new Set() }
  u.holders.add(clean(r.account_holder))
  users.set(r.user_id, u)
}

const byFull = new Map()
const byFirstInProvince = new Map()
const byFirstAll = new Map()
for (const m of registry) {
  const fk = key(m.full_name)
  byFull.set(fk, [...(byFull.get(fk) || []), m])
  const ak = key(firstToken(m.full_name))
  byFirstAll.set(ak, [...(byFirstAll.get(ak) || []), m])
  if (m.home_province === PROVINCE) {
    const k = key(firstToken(m.full_name))
    byFirstInProvince.set(k, [...(byFirstInProvince.get(k) || []), m])
  }
}

console.log(`Loaded ${users.size} users with account_holder · registry ${registry.length} rows (org ${ORG_ID})`)

// ── วางแผน ────────────────────────────────────────────────────────────────
const phonePlan = []      // { u, member, level }
const weak = []           // รอคนยืนยัน
const ambiguous = []      // { u, candidates, scope } — รอคนเลือก
const skipped = []        // [label, reason]
const namePlan = []       // { u, firstname, lastname }

for (const u of users.values()) {
  const label = `#${u.user_id} @${u.username || '-'}`

  // firstname — เติมเฉพาะช่องว่าง
  if (!u.firstname?.trim()) {
    if (u.holders.size > 1) skipped.push([label, 'account_holder หลายค่า — ไม่เติม firstname'])
    else {
      const [holder] = u.holders
      const [first, ...rest] = holder.split(' ')
      namePlan.push({ u, firstname: first, lastname: !u.lastname?.trim() && rest.length ? rest.join(' ') : null })
    }
  } else if (![...u.holders].some(h => key(firstToken(h)) === key(u.firstname))) {
    skipped.push([label, 'firstname ในระบบไม่ตรง account_holder — ไม่เขียนทับ'])
  }

  // เบอร์
  if (u.phone_verified_at) { skipped.push([label, 'ยืนยันเบอร์แล้ว']); continue }

  let member = null, level = null
  if (u.firstname?.trim() && u.lastname?.trim()) {
    const hits = byFull.get(key(`${u.firstname}${u.lastname}`)) || []
    if (hits.length === 1) { member = hits[0]; level = 'strong' }
    else if (hits.length > 1) { skipped.push([label, `ชื่อ-นามสกุลซ้ำในทะเบียน ${hits.length} คน`]); continue }
  }
  if (!member) {
    if (u.holders.size > 1) { skipped.push([label, 'account_holder หลายค่า']); continue }
    const fk = key(firstToken([...u.holders][0]))
    const hits = byFirstInProvince.get(fk) || []
    if (hits.length === 1) { member = hits[0]; level = 'weak' }
    else {
      const scope = hits.length ? PROVINCE : 'ทุกจังหวัด'
      const candidates = hits.length ? hits : (byFirstAll.get(fk) || [])
      const pick = PICKS.get(u.user_id)
      if (pick) {
        member = candidates.find(c => c.source_id === pick)
        if (!member) { skipped.push([label, `--pick ${pick} ไม่อยู่ในรายชื่อผู้สมัคร`]); continue }
        level = 'picked'
      } else {
        if (!candidates.length) skipped.push([label, 'ไม่พบชื่อต้นนี้ในทะเบียนเลย'])
        else if (candidates.length > MAX_CANDIDATES) skipped.push([label, `ชื่อต้นซ้ำเกิน ${MAX_CANDIDATES} คน (${scope})`])
        else ambiguous.push({ u, candidates, scope })
        continue
      }
    }
  }

  const phone = normPhone(member.mobile_number)
  if (!phone) { skipped.push([label, 'ทะเบียนไม่มีเบอร์มือถือที่ใช้ได้']); continue }
  if (u.phone && u.phone !== phone) { skipped.push([label, `มีเบอร์ (ยังไม่ยืนยัน) คนละเบอร์กับทะเบียน`]); continue }
  const owner = verifiedOwner.get(phone)
  if (owner && owner !== u.user_id) { skipped.push([label, `เบอร์นี้ user #${owner} ยืนยันไว้แล้ว`]); continue }

  if (level === 'weak' && !CONFIRMED.has(u.user_id)) { weak.push({ u, member, phone }); continue }
  phonePlan.push({ u, member, phone, level, label })
}

// เบอร์ชนกันเองในชุด → ข้ามทั้งหมดที่ชน
const phoneCount = phonePlan.reduce((m, p) => m.set(p.phone, (m.get(p.phone) || 0) + 1), new Map())
const finalPlan = phonePlan.filter(p => {
  if (phoneCount.get(p.phone) > 1) { skipped.push([p.label, 'เบอร์ชนกับอีกคนในชุดนี้']); return false }
  return true
})

// ── รายงาน ────────────────────────────────────────────────────────────────
const lv = l => finalPlan.filter(p => p.level === l).length
console.log(`\nจะอัปเดตเบอร์ ${finalPlan.length} คน (strong ${lv('strong')} · weak ที่ยืนยันแล้ว ${lv('weak')} · เลือกจากไฟล์ ${lv('picked')})`)
for (const p of finalPlan) console.log(`  ${p.label} [${p.level}] → ${mask(p.phone)}`)
console.log(`\nรอยืนยัน (weak) ${weak.length} คน — ใช้ --review-out ดูรายละเอียด แล้วส่ง id ที่ใช่ผ่าน --confirm`)
console.log(`  ids: ${weak.map(w => w.u.user_id).join(',')}`)
console.log(`\nรอเลือกผู้สมัคร ${ambiguous.length} คน (${ambiguous.reduce((s, a) => s + a.candidates.length, 0)} แถวในไฟล์ตรวจ ชีต pick) — ส่งผลผ่าน --pick user_id:source_id`)
console.log(`\nจะเติม firstname ${namePlan.length} คน`)
console.log(`\nข้าม ${skipped.length} รายการ:`)
const reasons = skipped.reduce((m, [, r]) => m.set(r, (m.get(r) || 0) + 1), new Map())
for (const [r, n] of reasons) console.log(`  ${n} × ${r}`)
for (const [l, r] of skipped.filter(([, r]) => r.includes('ไม่เขียนทับ'))) console.log(`    ${l}: ${r}`)

if (REVIEW_OUT) {
  const rows = weak.map(w => ({
    user_id: w.u.user_id,
    'discord username': w.u.username || '',
    'ชื่อจริง (จากไฟล์บัญชี)': [...w.u.holders][0],
    'ชื่อในระบบ': [w.u.firstname, w.u.lastname].filter(Boolean).join(' '),
    'ชื่อในทะเบียนพรรค': w.member.full_name,
    'เบอร์ในทะเบียน': mask(w.phone),
    'ใช่คนเดียวกัน? (y)': '',
  }))
  // 1 แถว = 1 ผู้สมัคร · ติ๊ก y ได้คนเดียวต่อ user · source_id คือค่าที่ส่งกลับใน --pick
  const pickRows = ambiguous.flatMap(a => a.candidates.map((c, i) => ({
    user_id: a.u.user_id,
    'discord username': a.u.username || '',
    'ชื่อจริง (จากไฟล์บัญชี)': [...a.u.holders][0],
    'ชื่อในระบบ': [a.u.firstname, a.u.lastname].filter(Boolean).join(' '),
    'ผู้สมัคร': `${i + 1}/${a.candidates.length}`,
    'ค้นใน': a.scope,
    'ชื่อ-นามสกุลในทะเบียนพรรค': c.full_name,
    'จังหวัด': c.home_province || '',
    'เบอร์ในทะเบียน': mask(normPhone(c.mobile_number)) || '(ไม่มีเบอร์)',
    source_id: c.source_id,
    'ใช่คนนี้? (y)': '',
  })))
  const wb = XLSX.utils.book_new()
  if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'review')
  if (pickRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pickRows), 'pick')
  if (wb.SheetNames.length) {
    XLSX.writeFile(wb, REVIEW_OUT)
    console.log(`\nเขียนไฟล์ตรวจ review ${rows.length} แถว · pick ${pickRows.length} แถว → ${REVIEW_OUT}`)
  } else console.log('\nไม่มีรายชื่อให้ตรวจ — ไม่ได้เขียนไฟล์')
}

if (!APPLY) {
  console.log('\n(dry-run — ใส่ --apply เพื่อเขียนจริง)')
  await pool.end()
  process.exit(0)
}

// ── เขียนจริง ────────────────────────────────────────────────────────────
const client = await pool.connect()
try {
  await client.query('BEGIN')
  let phones = 0, names = 0
  for (const [i, p] of finalPlan.entries()) {
    const r = await client.query(
      `UPDATE users SET phone = $1, phone_verified_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND phone_verified_at IS NULL`,
      [p.phone, p.u.user_id]
    )
    phones += r.rowCount
    process.stdout.write(`\r  phone ${i + 1}/${finalPlan.length}`)
  }
  for (const n of namePlan) {
    const r = await client.query(
      `UPDATE users SET firstname = $1, lastname = COALESCE(NULLIF(TRIM(lastname), ''), $2), updated_at = NOW()
        WHERE id = $3 AND COALESCE(TRIM(firstname), '') = ''`,
      [n.firstname, n.lastname, n.u.user_id]
    )
    names += r.rowCount
  }
  await client.query('COMMIT')
  console.log(`\nDone: phone ${phones} แถว · firstname ${names} แถว`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('\nROLLBACK:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
