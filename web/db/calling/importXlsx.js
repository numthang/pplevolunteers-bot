import pool from '../index.js'

// นำเข้าผลลัพธ์จาก parseCallingXlsx (web/lib/calling/parseXlsxImport.js) เข้า DB จริง
// ทั้งหมดอยู่ใน transaction เดียว (คนละแถวจะได้ไม่ค้างครึ่งๆ กลางๆ ถ้าพัง)
// chunk เป็นก้อนละ 400 แถว กัน parameterized query ชนเพดาน (pg รับ param ได้ 65535/statement)

const CHUNK_SIZE = 400

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function upsertMembersChunk(client, orgId, rows) {
  const cols = ['source_id', 'serial', 'first_name', 'last_name', 'full_name', 'membership_type', 'home_province', 'home_amphure', 'home_district', 'mobile_number', 'org_id']
  const values = []
  const tuples = rows.map((m, i) => {
    const base = i * cols.length
    values.push(m.source_id, m.serial, m.first_name, m.last_name, m.full_name, m.membership_type, m.home_province, m.home_amphure, m.home_district, m.mobile_number, orgId)
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(', ')})`
  })

  await client.query(
    `INSERT INTO cache_pple_member (${cols.join(', ')})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (source_id) DO UPDATE SET
       serial = EXCLUDED.serial, first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name, full_name = EXCLUDED.full_name,
       membership_type = EXCLUDED.membership_type, home_province = EXCLUDED.home_province,
       home_amphure = EXCLUDED.home_amphure, home_district = EXCLUDED.home_district,
       mobile_number = EXCLUDED.mobile_number, org_id = EXCLUDED.org_id,
       synced_at = CURRENT_TIMESTAMP`,
    values
  )
}

async function insertLogsChunk(client, orgId, campaignId, calledAt, rows) {
  const cols = ['campaign_id', 'contact_type', 'member_id', 'caller_name', 'called_at', 'status', 'sig_overall', 'note', 'org_id']
  const values = []
  const tuples = rows.map((l, i) => {
    const base = i * cols.length
    values.push(campaignId, 'member', String(l.sourceId), l.callerName, calledAt, l.status, l.sigOverall, l.note, orgId)
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(', ')})`
  })

  await client.query(
    `INSERT INTO calling_logs (${cols.join(', ')}) VALUES ${tuples.join(', ')}`,
    values
  )
}

async function upsertTiersChunk(client, orgId, rows) {
  const cols = ['member_id', 'contact_type', 'tier', 'tier_source', 'org_id']
  const values = []
  const tuples = rows.map((t, i) => {
    const base = i * cols.length
    values.push(String(t.sourceId), 'member', t.tier, 'auto', orgId)
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(', ')})`
  })

  await client.query(
    `INSERT INTO calling_member_tiers (${cols.join(', ')})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (member_id, contact_type) DO UPDATE SET
       tier = EXCLUDED.tier, tier_source = EXCLUDED.tier_source, org_id = EXCLUDED.org_id, updated_at = NOW()`,
    values
  )
}

/**
 * @param {number} orgId
 * @param {string} guildId  guild ที่จะผูก cache_pple_event campaign (feature นี้ยัง guild-scoped)
 * @param {number} campaignId
 * @param {string} campaignName
 * @param {string} province
 * @param {string} calledAt  'YYYY-MM-DD HH:MM:SS'
 * @param {{members:object[], logs:object[], tiers:{sourceId:number,tier:string}[]}} parsed
 */
export async function runCallingImport(orgId, guildId, campaignId, campaignName, province, calledAt, parsed) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const rows of chunk(parsed.members, CHUNK_SIZE)) {
      await upsertMembersChunk(client, orgId, rows)
    }

    await client.query(
      `INSERT INTO cache_pple_event (id, type, name, province, guild_id, synced_at)
       VALUES ($1, 'campaign', $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, guild_id = EXCLUDED.guild_id, synced_at = NOW()`,
      [campaignId, campaignName, province, guildId]
    )

    for (const rows of chunk(parsed.logs, CHUNK_SIZE)) {
      await insertLogsChunk(client, orgId, campaignId, calledAt, rows)
    }

    for (const rows of chunk(parsed.tiers, CHUNK_SIZE)) {
      await upsertTiersChunk(client, orgId, rows)
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return {
    memberCount: parsed.members.length,
    logCount: parsed.logs.length,
    tierCount: parsed.tiers.length,
  }
}
