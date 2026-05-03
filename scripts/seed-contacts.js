import pool from '../web/db/index.js'

const GUILD_ID = '1340903354037178410'

const contacts = [
  { first_name: 'สมชาย',   last_name: 'ใจดี',          phone: '0812345601', line_id: 'somchai_j',  category: 'donor',     province: 'ราชบุรี',          amphoe: 'เมืองราชบุรี',    tambon: 'หน้าเมือง',      note: 'บริจาคปีละครั้ง สนใจโครงการเด็ก' },
  { first_name: 'วิภา',     last_name: 'รักชาติ',       phone: '0823456702', line_id: 'wipa_r',     category: 'prospect',  province: 'ราชบุรี',          amphoe: 'โพธาราม',         tambon: 'ดอนทราย',        note: 'สนใจเป็นอาสาฯ แต่ยังไม่แน่ใจ' },
  { first_name: 'ประยุทธ',  last_name: 'มั่นคง',        phone: '0834567803', line_id: null,         category: 'volunteer', province: 'ราชบุรี',          amphoe: 'บ้านโป่ง',        tambon: 'บ้านโป่ง',       note: 'เคยร่วมกิจกรรมปีที่แล้ว' },
  { first_name: 'นิภา',     last_name: 'สุขสม',         phone: '0845678904', line_id: 'nipa_s',     category: 'donor',     province: 'นครปฐม',           amphoe: 'เมืองนครปฐม',    tambon: 'พระปฐมเจดีย์',  note: 'ให้ทุนการศึกษา' },
  { first_name: 'กิตติ',    last_name: 'วงศ์ใหญ่',      phone: '0856789005', line_id: 'kitti_w',    category: 'prospect',  province: 'นครปฐม',           amphoe: 'กำแพงแสน',        tambon: 'ทุ่งกระพังโหม', note: null },
  { first_name: 'มาลี',     last_name: 'ดอกไม้',        phone: '0867890106', line_id: 'malee_d',    category: 'volunteer', province: 'กาญจนบุรี',        amphoe: 'เมืองกาญจนบุรี', tambon: 'ท่ามะขาม',       note: 'ช่วยงานอีเวนต์ได้วันเสาร์' },
  { first_name: 'ธนากร',   last_name: 'เจริญทรัพย์',   phone: '0878901207', line_id: null,         category: 'donor',     province: 'กาญจนบุรี',        amphoe: 'ท่าม่วง',         tambon: 'ท่าม่วง',        note: 'ธุรกิจโรงแรม บริจาคห้องพักสำหรับทีม' },
  { first_name: 'พิมพ์ใจ', last_name: 'ชมชื่น',        phone: '0889012308', line_id: 'pimjai_c',   category: 'prospect',  province: 'เพชรบุรี',         amphoe: 'เมืองเพชรบุรี',  tambon: 'คลองกระแชง',     note: 'พบในงาน fair เดือนที่แล้ว' },
  { first_name: 'อนันต์',   last_name: 'สว่างใจ',       phone: '0890123409', line_id: 'anan_sw',    category: 'other',     province: 'สุพรรณบุรี',       amphoe: 'เมืองสุพรรณบุรี',tambon: 'ท่าพี่เลี้ยง',   note: 'ติดต่อผ่านเพจ FB' },
  { first_name: 'ชุติมา',  last_name: 'แก้วใส',        phone: '0801234510', line_id: 'chutima_k',  category: 'volunteer', province: 'ประจวบคีรีขันธ์', amphoe: 'หัวหิน',          tambon: 'หัวหิน',          note: 'มีเครือข่ายในพื้นที่ดีมาก' },
]

const [result] = await pool.query(
  `INSERT INTO calling_contacts (guild_id, first_name, last_name, phone, line_id, category, province, amphoe, tambon, note) VALUES ?`,
  [contacts.map(c => [GUILD_ID, c.first_name, c.last_name, c.phone, c.line_id, c.category, c.province, c.amphoe, c.tambon, c.note])]
)

console.log(`Done: inserted ${result.affectedRows} contacts`)
await pool.end()
