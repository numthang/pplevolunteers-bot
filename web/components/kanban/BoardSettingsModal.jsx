'use client'

/**
 * BoardSettingsModal — กล่องตั้งค่า **กระดาน** หรือ **teamspace** (2026-09-07)
 *
 * กล่องเดียว 2 โหมด (`kind`) เพราะฟิลด์เกือบซ้อนกันหมด และเปิดจากลิสต์เดียวกัน —
 * แยกเป็น 2 ไฟล์จะได้โค้ดคู่แฝดที่ลืมแก้ตามกันแน่ (บทเรียนเดิมของกล่องลบ)
 *
 * ⚠️ **teamspace ≠ หน้า /team** — teamspace คือชั้นเหนือกระดานใน KANBAN
 *    (org > teamspace > boards > cards) ส่วน /team คือรายชื่อสมาชิกในเซิร์ฟดิสคอร์ด
 *
 * ⛔ กล่องนี้ **ไม่มีสวิตช์สิทธิ์ใดๆ** โดยตั้งใจ — รอบนี้ทุกคนใน org เห็นทุกอย่าง (user สั่ง)
 *    ปิดครึ่งเดียว (ซ่อนชื่อแต่การ์ดยังหลุด) = ความเป็นส่วนตัวปลอม
 *
 * เป็นหน้า Update → **autosave ไม่ได้** เพราะฟิลด์ผูกกับการย้ายของ (ย้ายกระดานข้ามทีมทันทีที่
 * เลือกใน select = อุบัติเหตุ) → ใช้ปุ่มบันทึกตามกฎ "Update ที่ไม่มี autosave ยังต้องมีปุ่ม"
 * ปิดได้ 3 ทางตามกฎบ้าน: ปุ่ม X · ESC · คลิกนอกกล่อง
 */

import { useEffect, useState } from 'react'
import { Loader2, X, Archive } from 'lucide-react'

export default function BoardSettingsModal({
  kind,            // 'board' | 'teamspace'
  item,            // แถวที่กำลังแก้
  teamspaces = [], // โหมดกระดาน: ตัวเลือก "ย้ายไปทีม…"
  guilds = [],     // โหมด teamspace: ตัวเลือก "ผูกเซิร์ฟ…"
  isDefaultBoard = false,
  busy,
  error,
  onSave,          // (patch, { makeDefaultBoard }) => void
  onArchive,
  onClose,
  t,
}) {
  const [name, setName] = useState(item?.name || '')
  const [detail, setDetail] = useState(item?.detail || '')
  const [teamspaceId, setTeamspaceId] = useState(item?.teamspace_id ? String(item.teamspace_id) : '')
  const [guildId, setGuildId] = useState(item?.guild_id || '')
  const [makeDefault, setMakeDefault] = useState(isDefaultBoard)

  // ESC — capture + stopPropagation ด้วยเหตุผลเดียวกับ DeleteChoiceDialog (กล่องอื่นผูก ESC ไว้ก่อน)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const isBoard = kind === 'board'

  function submit(e) {
    e.preventDefault()
    const patch = { name: name.trim(), detail: detail.trim() }
    if (isBoard) patch.teamspaceId = teamspaceId ? Number(teamspaceId) : undefined
    else patch.guildId = guildId || null
    onSave(patch, { makeDefaultBoard: isBoard && makeDefault && !isDefaultBoard })
  }

  const inputCls = 'w-full h-9 px-2.5 text-sm rounded-md border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'
  const labelCls = 'text-sm font-medium text-warm-700 dark:text-disc-text'

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 w-full max-w-md flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">
            {isBoard ? t('board.boardSettings') : t('board.teamspaceSettings')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.cancel')}
            className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
          >
            <X size={18} />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>{isBoard ? t('board.boardName') : t('board.teamspaceName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} autoFocus />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t('board.detailLabel')}</span>
          <input value={detail} onChange={(e) => setDetail(e.target.value)} className={inputCls} />
        </label>

        {isBoard ? (
          <>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t('board.inTeamspace')}</span>
              <select value={teamspaceId} onChange={(e) => setTeamspaceId(e.target.value)} className={inputCls}>
                {teamspaces.map((ts) => (
                  <option key={ts.id} value={String(ts.id)}>{ts.name}</option>
                ))}
              </select>
            </label>

            {/* บอร์ดตั้งต้นของทีม = ที่ที่การ์ดจากดิสคอร์ดของเซิร์ฟที่ผูกกับทีมนี้จะไปลง */}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={makeDefault}
                disabled={isDefaultBoard}
                onChange={(e) => setMakeDefault(e.target.checked)}
                className="mt-1 accent-teal"
              />
              <span className="text-sm text-warm-700 dark:text-disc-text">
                {t('board.defaultBoardLabel')}
                <span className="block text-sm text-warm-500 dark:text-disc-muted">{t('board.defaultBoardHint')}</span>
              </span>
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('board.linkedGuild')}</span>
            <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={inputCls}>
              <option value="">{t('board.noGuild')}</option>
              {guilds.map((g) => (
                <option key={g.guild_id} value={g.guild_id}>{g.name}</option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex flex-wrap gap-2 justify-between items-center mt-1">
          <button
            type="button"
            onClick={onArchive}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover disabled:opacity-50"
          >
            <Archive size={14} />
            {t('actions.archive')}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50"
            >
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {t('actions.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
