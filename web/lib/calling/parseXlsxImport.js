// web/lib/calling/parseXlsxImport.js
// Parse calling log XLSX (province sheet) → members / logs / tiers
// ports the same sheet-structure detection as scripts/calling/import-calling-xlsx.js
// so backoffice import produces identical results to the CLI script.
import * as XLSX from 'xlsx'

const SKIP_SHEETS = new Set(['อ่านก่อนโทร', 'latest'])
const CALLER_LABELS = new Set(['CALLER_NAME', 'ผู้รับผิดชอบ', 'โทรโดย', 'โดย'])
const GRADE_TO_SIG = { A: 4, B: 3, C: 2, D: 1 }

function extractSourceId(cell) {
  if (!cell) return null
  const url = cell.l?.Target ?? cell.f ?? ''
  const m = String(url).match(/\/memberships\/(\d+)/)
  return m ? parseInt(m[1]) : null
}

function extractGrade(text) {
  if (!text) return null
  const m = String(text).match(/\b([ABCD])[+\-]?(?:\s|$)/i)
  return m ? m[1].toUpperCase() : null
}

function detectSheetStructure(h1, h2) {
  let detailCol = h1.findIndex(v => v === 'รายละเอียด')
  if (detailCol < 0) detailCol = h2.findIndex(v => v === 'รายละเอียด')

  const tierCol = h2.findIndex(v => String(v ?? '').trim() === 'TIER')

  const roundStartCols = []
  h1.forEach((v, i) => {
    if (!v) return
    const m = String(v).match(/ครั้งที่\s*(\d+)/)
    if (m) roundStartCols.push({ col: i, roundNum: parseInt(m[1]) })
  })

  const firstRoundCol = roundStartCols.length ? roundStartCols[0].col : Infinity

  let globalCallerCol = -1
  h1.forEach((v, i) => {
    if (i < firstRoundCol && String(v ?? '').trim() === 'CALLER_NAME') globalCallerCol = i
  })

  const rounds = roundStartCols.map(({ col, roundNum }, ri) => {
    const endCol = ri + 1 < roundStartCols.length ? roundStartCols[ri + 1].col : col + 4
    let callerCol = -1, noteCol = -1
    for (let c = col + 1; c < endCol && c <= col + 3; c++) {
      const sub = String(h2[c] ?? '').trim()
      if (CALLER_LABELS.has(sub) && callerCol < 0) callerCol = c
      if (sub.startsWith('หมายเหตุ') && noteCol < 0) noteCol = c
    }
    return { roundNum, calledCol: col, callerCol, noteCol }
  }).filter(r => r.roundNum > 0)

  return { detailCol, tierCol, globalCallerCol, rounds }
}

/**
 * @param {Buffer} buffer  ไฟล์ xlsx ดิบ
 * @param {string} provinceName  จังหวัดปลายทาง (ใช้เติม home_province + ตั้งชื่อแคมเปญ)
 * @returns {{ members: object[], logs: object[], tiers: {sourceId:number, tier:string}[], campaignName: string, warnings: string[] }}
 */
export function parseCallingXlsx(buffer, provinceName) {
  const wb = XLSX.read(buffer, { type: 'buffer' })

  const members = new Map()   // source_id → member data (first occurrence wins)
  const logs = []
  const lastGrade = new Map() // source_id → last grade letter
  const warnings = []

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue

    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    const h1 = (data[0] ?? []).map(v => (v == null ? null : String(v).trim()))
    const h2 = (data[1] ?? []).map(v => (v == null ? null : String(v).trim()))

    const { detailCol, tierCol, globalCallerCol, rounds } = detectSheetStructure(h1, h2)

    if (detailCol < 0) {
      warnings.push(`ไม่มีคอลัมน์ "รายละเอียด" ในชีต: ${sheetName}`)
      continue
    }

    const colMap = {
      serial: h1.findIndex(v => v === 'รหัสสมาชิก'),
      fullname: h1.findIndex(v => v === 'ชื่อ'),
      membership: h1.findIndex(v => v === 'สมาชิก'),
      amphure: h1.findIndex(v => v === 'อำเภอ'),
      tambon: h1.findIndex(v => v === 'ตำบล'),
      phone: h1.findIndex(v => v === 'เบอร์ติดต่อ'),
    }

    for (let ri = 2; ri < data.length; ri++) {
      const row = data[ri]
      const cellRef = XLSX.utils.encode_cell({ r: ri, c: detailCol })
      const sourceId = extractSourceId(ws[cellRef])
      if (!sourceId) continue

      // ── member cache (partial) ──
      if (!members.has(sourceId)) {
        const fullName = colMap.fullname >= 0 ? String(row[colMap.fullname] ?? '').trim() : ''
        const parts = fullName.split(/\s+/)
        const firstName = parts[0] || ''
        if (firstName) {
          members.set(sourceId, {
            source_id: sourceId,
            serial: colMap.serial >= 0 ? (String(row[colMap.serial] ?? '').trim() || null) : null,
            first_name: firstName,
            last_name: parts.slice(1).join(' ') || '-',
            full_name: fullName || null,
            membership_type: colMap.membership >= 0 ? (String(row[colMap.membership] ?? '').trim() || null) : null,
            home_province: provinceName,
            home_amphure: colMap.amphure >= 0 ? (String(row[colMap.amphure] ?? '').trim() || null) : null,
            home_district: colMap.tambon >= 0 ? (String(row[colMap.tambon] ?? '').trim() || null) : null,
            mobile_number: colMap.phone >= 0 ? (String(row[colMap.phone] ?? '').trim() || null) : null,
          })
        }
      }

      // ── calling logs ──
      if (rounds.length === 0) continue

      const globalCaller = globalCallerCol >= 0
        ? (String(row[globalCallerCol] ?? '').trim() || null)
        : null

      let memberTier = null
      if (tierCol >= 0 && row[tierCol]) {
        memberTier = extractGrade(String(row[tierCol]))
        if (memberTier) lastGrade.set(sourceId, memberTier)
      }

      for (const round of rounds) {
        const note = round.noteCol >= 0
          ? (String(row[round.noteCol] ?? '').trim() || null)
          : null
        if (!note) continue

        const callerName = round.callerCol >= 0
          ? (String(row[round.callerCol] ?? '').trim() || globalCaller)
          : globalCaller

        const grade = tierCol >= 0 ? memberTier : extractGrade(note)
        const sigOverall = grade ? GRADE_TO_SIG[grade] : null
        if (tierCol < 0 && grade) lastGrade.set(sourceId, grade)

        logs.push({ sourceId, callerName, note, status: 'answered', sigOverall })
      }
    }
  }

  return {
    members: Array.from(members.values()),
    logs,
    tiers: Array.from(lastGrade.entries()).map(([sourceId, tier]) => ({ sourceId, tier })),
    campaignName: `${provinceName}.xlsx`,
    warnings,
  }
}
