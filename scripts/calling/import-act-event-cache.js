#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const path = require('path')
const crypto = require('crypto')
const XLSX = require('xlsx')
const pool = require('../../db')

const XLSX_PATH = path.join(__dirname, '../../md/docs/act_event_register.xlsx')
const CAMPAIGN_ID = 146354
const GUILD_ID = '1'

async function main() {
  const wb = XLSX.readFile(XLSX_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { blankrows: false, defval: '' })

  console.log(`📊 Loaded ${rows.length} registrations from ${XLSX_PATH}`)

  const mapped = rows.map((row, idx) => {
    const ref = row[' Ref'] || idx
    const timestamp = row[' Timestamp']
    const userId = row[' User ID']
    const serialNum = (row['  เลขสมาชิก'] || '').trim()
    const title = (row[' คำนำหน้าชื่อ (ภาษาไทย)'] || '').trim()
    const firstName = (row[' ชื่อจริง (ภาษาไทย)'] || '').trim()
    const lastName = (row[' นามสกุล (ภาษาไทย)'] || '').trim()
    const phone = (row[' เบอร์โทร'] || '').trim()
    const nationalId = (row[' เลขบัตรประชาชน'] || '').trim().replace(/-/g, '')
    const address = (row[' ที่อยู่ตามทะเบียนบ้าน (บ้านเลขที่ อาคาร หมู่บ้าน หมู่ ซอย ถนน)'] || '').trim()
    const subdistrict = (row[' ตำบล/แขวง'] || '').trim()
    const district = (row[' อำเภอ/เขต'] || '').trim()
    const province = (row[' จังหวัด'] || '').trim()
    const postalCode = (row[' รหัสไปรษณีย์'] || '').trim()
    const age = row['  อายุ']
    const gender = (row['  เพศ'] || '').trim()
    const accountNo = row['account_no']
    const bank = row['bank']
    const membershipStatus = (row['  สมาชิกภาพ'] || '').trim()

    const dataStr = JSON.stringify({
      userId, serialNum, title, firstName, lastName, phone, nationalId,
      address, subdistrict, district, province, postalCode, age, gender,
      accountNo, bank, membershipStatus
    })
    const dataHash = crypto.createHash('sha256').update(dataStr).digest('hex')

    return {
      id: ref,
      parent_id: CAMPAIGN_ID,
      guild_id: GUILD_ID,
      type: 'register',
      name: null,
      province,
      description: null,
      user_id: userId,
      serial_number: serialNum,
      title,
      first_name: firstName,
      last_name: lastName,
      phone,
      national_id: nationalId,
      address,
      subdistrict,
      district,
      postal_code: postalCode,
      age: age && age !== 'N/A' ? parseInt(age) : null,
      gender,
      account_no: accountNo,
      bank,
      membership_status: membershipStatus,
      data_hash: dataHash,
      synced_at: new Date(),
      source_timestamp: timestamp instanceof Date ? timestamp : new Date()
    }
  })

  console.log(`✅ Mapped ${mapped.length} rows`)

  const sql = `
    INSERT INTO act_event_cache
    (id, parent_id, guild_id, type, name, province, description,
     user_id, serial_number, title, first_name, last_name, phone, national_id,
     address, subdistrict, district, postal_code, age, gender, account_no, bank, membership_status,
     data_hash, synced_at, source_timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    ON CONFLICT (id) DO UPDATE SET
      parent_id         = EXCLUDED.parent_id,
      guild_id          = EXCLUDED.guild_id,
      user_id           = EXCLUDED.user_id,
      serial_number     = EXCLUDED.serial_number,
      title             = EXCLUDED.title,
      first_name        = EXCLUDED.first_name,
      last_name         = EXCLUDED.last_name,
      phone             = EXCLUDED.phone,
      national_id       = EXCLUDED.national_id,
      address           = EXCLUDED.address,
      subdistrict       = EXCLUDED.subdistrict,
      district          = EXCLUDED.district,
      postal_code       = EXCLUDED.postal_code,
      age               = EXCLUDED.age,
      gender            = EXCLUDED.gender,
      account_no        = EXCLUDED.account_no,
      bank              = EXCLUDED.bank,
      membership_status = EXCLUDED.membership_status,
      data_hash         = EXCLUDED.data_hash,
      synced_at         = EXCLUDED.synced_at,
      source_timestamp  = EXCLUDED.source_timestamp,
      updated_at        = CURRENT_TIMESTAMP
    RETURNING (xmax::text::int > 0) AS was_updated
  `

  let inserted = 0
  let updated = 0

  try {
    for (const row of mapped) {
      const result = await pool.query(sql, [
        row.id, row.parent_id, row.guild_id, row.type, row.name, row.province, row.description,
        row.user_id, row.serial_number, row.title, row.first_name, row.last_name, row.phone, row.national_id,
        row.address, row.subdistrict, row.district, row.postal_code, row.age, row.gender, row.account_no, row.bank, row.membership_status,
        row.data_hash, row.synced_at, row.source_timestamp
      ])

      if (result.rows[0].was_updated) updated++
      else inserted++
    }

    console.log(`\n📝 Insert: ${inserted}, Update: ${updated}`)
    console.log(`✨ Done! Synced at ${new Date().toLocaleString('th-TH')}`)
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
