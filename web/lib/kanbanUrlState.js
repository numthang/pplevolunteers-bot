/**
 * แปลง "หน้าตาที่เห็นบนกระดาน" ↔ query string — ตรรกะล้วน ไม่แตะ DOM/React
 * (เทสอยู่ที่ lib/__tests__/kanbanUrlState.test.js)
 *
 * ⭐ **URL เป็นเจ้าของสถานะที่มองเห็น** — กติกาเดียวกับที่ `?card=` ตั้งไว้ตั้งแต่ 2026-08-28
 *    ขยายมาคลุมตัวกรองทั้งชุด 2026-08-30 เพราะ user ต้อง **ส่งลิงก์ให้คนอื่นแล้วเห็นหน้าเดียวกัน**
 *
 * ⛔ **ค่าตั้งต้นห้ามลง URL** — ลิงก์ต้องสั้นและอ่านออก (`/kanban?group=due` ไม่ใช่ `?scope=mine&group=due&...`)
 *    นี่ไม่ใช่แค่ความสวย: ถ้าเขียนทุกค่า ทุกครั้งที่เปิดหน้าเปล่าจะได้ URL ยาวเหยียดทันที
 *
 * ⚠️ **ทุกอย่างเป็น id ไม่ใช่ชื่อ** — เปลี่ยนชื่อป้าย/ฟิลด์/กระดานแล้วลิงก์เก่าต้องยังถูก
 *    ที่พังได้คือ "ถูกลบ" ไม่ใช่ "ถูกเปลี่ยนชื่อ" — ฝั่ง UI จัดการด้วยชิป "ตัวกรองที่ไม่รู้จัก"
 *
 * ⚠️ `label` เก็บเป็น `<field_id>.<option_id>` ไม่ใช่ option id เปล่าๆ — **จำเป็น ไม่ใช่ของแถม**
 *    กติกากรองคือ "OR ในกลุ่มเดียวกัน · AND ข้ามกลุ่ม" (kanbanTagFilter.js)
 *    คนเปิดลิงก์อาจไม่มีการ์ดที่ติด option นั้นสักใบ → หา field ของมันจากการ์ดไม่ได้
 *    ถ้าไม่พก field_id มาด้วย ตัวที่ไม่รู้จักจะตกไปกองเดียวกันหมดแล้วผลลัพธ์ต่างจากคนส่ง
 */

import { STATUS_TYPES } from './kanbanAccess.js'

export const SCOPES = ['mine', 'unassigned', 'assigned', 'all', 'archived']
export const GROUP_MODES = ['status', 'due']
export const KINDS = ['plain', 'case', 'post']

export const DEFAULT_VIEW = {
  board: null,
  scope: 'mine',
  group: 'status',
  status: [],
  kind: [],
  helper: [],
  label: [],      // [{ id, field_id }] — ชื่อ/สีเติมทีหลังจากการ์ดที่โหลดมา
  q: '',
  sort: null,     // { key, dir }
}

const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean)
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback)

/** '12.88' → { field_id: '12', id: '88' } · '88' (ลิงก์เก่า/พิมพ์มือ) → { field_id: null, id: '88' } */
function parseLabelToken(tok) {
  const dot = tok.indexOf('.')
  if (dot === -1) return { id: tok, field_id: null }
  return { field_id: tok.slice(0, dot), id: tok.slice(dot + 1) }
}

const labelToken = (l) => (l.field_id != null ? `${l.field_id}.${l.id}` : String(l.id))

/**
 * query string → สถานะกระดาน · ค่าที่อ่านไม่ออกตกกลับค่าตั้งต้นเงียบๆ ไม่ throw
 * (ลิงก์ที่คนแก้มือ/ลิงก์เก่า ต้องเปิดได้เสมอ ไม่ใช่หน้าพัง)
 * @param {URLSearchParams|string} input
 */
export function parseViewFromParams(input) {
  const p = typeof input === 'string' ? new URLSearchParams(input) : input
  if (!p) return { ...DEFAULT_VIEW }

  const board = p.get('board')
  const sortRaw = p.get('sort')
  let sort = null
  if (sortRaw) {
    const [key, dir] = sortRaw.split(':')
    if (key) sort = { key, dir: dir === 'desc' ? 'desc' : 'asc' }
  }

  return {
    board: board && /^\d+$/.test(board) ? Number(board) : null,
    scope: oneOf(p.get('scope'), SCOPES, 'mine'),
    group: oneOf(p.get('group'), GROUP_MODES, 'status'),
    status: list(p.get('status')).filter((s) => STATUS_TYPES.includes(s)),
    kind: list(p.get('kind')).filter((k) => KINDS.includes(k)),
    helper: list(p.get('helper')),
    label: list(p.get('label')).map(parseLabelToken),
    q: p.get('q') || '',
    sort,
  }
}

/**
 * สถานะกระดาน → query string (เรียงคีย์คงที่เสมอ ลิงก์เดียวกันหน้าตาเดียวกัน)
 * ⚠️ ไม่แตะ `card` — การ์ดที่เปิดอยู่เป็นคนละชั้น (pushState) คนเรียกต้องคงค่าเดิมไว้เอง
 * @returns {string} เช่น 'group=due' · '' ถ้าเป็นค่าตั้งต้นล้วน
 */
export function viewToQueryString(view = {}) {
  const v = { ...DEFAULT_VIEW, ...view }
  const p = new URLSearchParams()

  if (v.board) p.set('board', String(v.board))
  if (v.scope && v.scope !== DEFAULT_VIEW.scope) p.set('scope', v.scope)
  if (v.group && v.group !== DEFAULT_VIEW.group) p.set('group', v.group)
  if (v.status?.length) p.set('status', v.status.join(','))
  if (v.kind?.length) p.set('kind', v.kind.join(','))
  if (v.helper?.length) p.set('helper', v.helper.map(String).join(','))
  if (v.label?.length) p.set('label', v.label.map(labelToken).join(','))
  if (v.q?.trim()) p.set('q', v.q)
  if (v.sort?.key) p.set('sort', `${v.sort.key}:${v.sort.dir === 'desc' ? 'desc' : 'asc'}`)

  return p.toString()
}

/**
 * รวม query ของตัวกรองเข้ากับ URL ปัจจุบัน โดย **คง `card` เดิมไว้**
 * (ปิด/เปิดการ์ดเป็นคนละกลไก — ถ้าตรงนี้ลบ card ทิ้ง การกดตัวกรองตอนการ์ดกางอยู่จะเด้งปิดเอง)
 * @param {string} currentSearch  window.location.search
 * @returns {string} search ใหม่ (ยังไม่มี '?')
 */
export function mergeViewIntoSearch(currentSearch, view) {
  const card = new URLSearchParams(currentSearch).get('card')
  const qs = viewToQueryString(view)
  if (!card) return qs
  const p = new URLSearchParams(qs)
  p.set('card', card)
  return p.toString()
}

/**
 * ชิปที่ถูกเลือกอยู่ แต่ **หาไม่เจอในการ์ดที่โหลดมา** → ต้องโชว์เป็น "ตัวกรองที่ไม่รู้จัก"
 *
 * ⭐ ยัง **กรองต่อ** ไม่ใช่ทิ้ง — "ไม่เจอ" มี 2 ความหมายที่ client แยกไม่ออก:
 *    (ก) option ยังอยู่ แต่ไม่มีการ์ดใบไหนติด → กระดานว่าง = คำตอบที่ถูก
 *    (ข) option ถูกลบไปแล้ว → กระดานว่างตลอดกาล = ลิงก์ตาย
 *    ทิ้งเงียบๆ = คนเปิดลิงก์เห็นคนละอย่างกับคนส่ง (ซึ่งเป็นเหตุผลเดียวที่ทำฟีเจอร์นี้)
 *    → คงตัวกรองไว้ แล้ว **บอกให้เห็น** + กดถอดออกได้ใน 1 คลิก
 *
 * @param {{id:string|number}[]} selected
 * @param {Set<string>} knownIds  id ที่มีอยู่จริงบนการ์ดที่โหลดมา
 */
export function unknownSelections(selected = [], knownIds = new Set()) {
  return selected.filter((s) => !knownIds.has(String(s.id)))
}
