export const CATEGORIES = [
  { group: 'กลุ่มคน', options: [
    { value: 'donor',            label: 'ผู้บริจาค' },
    { value: 'prospect',         label: 'คนสนใจ' },
    { value: 'volunteer',        label: 'อาสาสมัคร' },
    { value: 'oranger',          label: 'อาสาส้ม' },
    { value: 'leader',           label: 'แกนนำ' },
    { value: 'community_leader', label: 'ผู้นำชุมชน' },
    { value: 'civil',            label: 'ประชาสังคม' },
    { value: 'media',            label: 'สื่อมวลชน' },
    { value: 'politician',       label: 'นักการเมือง/อปท.' },
  ]},
  { group: 'ผู้ให้บริการ', options: [
    { value: 'venue',          label: 'สถานที่' },
    { value: 'print',          label: 'งานพิมพ์/ป้าย' },
    { value: 'event_service',  label: 'บริการอีเวนต์' },
  ]},
  { group: 'อื่นๆ', options: [
    { value: 'other', label: 'อื่นๆ' },
  ]},
]

export const CATEGORY_LABELS = {
  donor:            'ผู้บริจาค',
  prospect:         'คนสนใจ',
  volunteer:        'อาสาสมัคร',
  oranger:          'อาสาส้ม',
  leader:           'แกนนำ',
  community_leader: 'ผู้นำชุมชน',
  civil:            'ประชาสังคม',
  media:            'สื่อมวลชน',
  politician:       'นักการเมือง/อปท.',
  venue:            'สถานที่',
  print:            'งานพิมพ์/ป้าย',
  event_service:    'บริการอีเวนต์',
  other:            'อื่นๆ',
}

export const CATEGORY_COLORS = {
  donor:            { bg: '#cce5f4', text: '#0c447c' },
  prospect:         { bg: '#ead3ce', text: '#714b2b' },
  volunteer:        { bg: '#d4edda', text: '#1a5e2d' },
  oranger:          { bg: '#fde8c8', text: '#b84d0f' },
  leader:           { bg: '#fde8c8', text: '#7c4a00' },
  community_leader: { bg: '#fde8c8', text: '#7c4a00' },
  civil:            { bg: '#e8d5f5', text: '#5b2d8e' },
  media:            { bg: '#dbeafe', text: '#1e40af' },
  politician:       { bg: '#fee2e2', text: '#991b1b' },
  venue:            { bg: '#f3f4f6', text: '#374151' },
  print:            { bg: '#f3f4f6', text: '#374151' },
  event_service:    { bg: '#f3f4f6', text: '#374151' },
  other:            { bg: '#f3f4f6', text: '#374151' },
}
