export const CALL_STATUS_COLORS = {
  pending:       { bg: '#ff9800', text: '#ffffff', label: 'รอโทร' },
  called:        { bg: '#e1f5f4', text: '#0d9e94', label: 'โทรแล้ว' },
  answered:      { bg: '#e1f5f4', text: '#0d9e94', label: 'รับสาย' },
  no_answer:     { bg: '#faeeda', text: '#854f0b', label: 'ไม่รับ' },
  not_called:    { bg: '#f3f4f6', text: '#6b7280', label: 'ข้าม' },
  met:           { bg: '#d4edda', text: '#1a5e2d', label: 'พบปะ' },
  sms_sent:      { bg: '#e0e7ff', text: '#4338ca', label: 'ส่ง SMS' },
  sms_delivered: { bg: '#dbeafe', text: '#1d4ed8', label: 'SMS ถึง' },
  sms_failed:    { bg: '#fcebeb', text: '#a32d2d', label: 'SMS ล้มเหลว' },
}
