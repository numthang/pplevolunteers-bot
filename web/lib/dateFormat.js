/**
 * dateFormat.js — Thai date formatting helpers (พ.ศ.)
 */

// แสดงวันที่แบบ human readable: "พุธที่ 8 เมษายน 2569"
export function formatThaiDate(d) {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date)) return '-'
  return date.toLocaleDateString('th-TH', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    calendar: 'buddhist',
  })
}

// แสดงวันที่สั้น: "8 เม.ย. 2569"
export function formatThaiDateShort(d) {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date)) return '-'
  return date.toLocaleDateString('th-TH', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
    calendar: 'buddhist',
  })
}

// แสดงวันที่ + เวลา: "8 เม.ย. 2569 16:05"
export function formatThaiDateTime(d) {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date)) return '-'
  return date.toLocaleString('th-TH', {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    calendar: 'buddhist',
  })
}

// header วันใน list: "พุธ 8 เมษายน 2569"
export function formatThaiDateHeader(d) {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date)) return '-'
  return date.toLocaleDateString('th-TH', {
    weekday: 'short',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    calendar: 'buddhist',
  })
}
