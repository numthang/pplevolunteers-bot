import pool from './index.js'

// web/db/orgchart.js — เวอร์ชันเว็บของ /orgchart (commands/orgchart.js + utils/orgchartEmbed.js)
// ต่างจากฝั่งบอทตรงที่ไม่มี live discord.js client ให้เดิน guild.members.cache
// จึงคำนวณ activity ทั้ง guild จาก DB ล้วนๆ ในคำสั่งเดียว (ไม่ loop ทีละ role — กัน N+1)
//
// สมาชิกต่อ role: org_members.roles เป็น string รายชื่อ role คั่นด้วย comma (ไม่ใช่ role_id)
// เพราะ sync จาก Discord เก็บแค่ชื่อ (ดู db/members.js:_deriveRoleFields) — join ด้วยชื่อ
// เหมือน pattern เดิมที่ web/db/orgMemberRoles.js ใช้ (unnest + trim) ไม่ประดิษฐ์ทางใหม่
// ⚠️ ข้อจำกัดที่รู้อยู่แล้ว (เหมือน getAdminGuildIds ใน web/db/guilds.js): ถ้า guild เดียวกันมี
// role ชื่อซ้ำกัน 2 role_id จะถูกนับรวมกัน — dc_orgchart_config ไม่มี unique constraint กันเรื่องนี้

const SCORE_MSG = 10
const SCORE_MENTION = 20

const SQL = `
WITH role_base AS (
  SELECT role_id, role_name, role_color, group_name, array_agg(DISTINCT channel_id) AS channel_ids
    FROM dc_orgchart_config
   WHERE guild_id = $1 AND excluded = FALSE
   GROUP BY role_id, role_name, role_color, group_name
),
-- ⚠️ dc_activity_* key ด้วย discord snowflake (varchar) แต่ org_members.user_id เป็น users.id (int)
-- หลัง identity split — ต้องพก discord_id ไปด้วยเพื่อ join ฝั่ง activity (ไม่งั้น varchar = integer)
member_roles AS (
  SELECT DISTINCT om.user_id, u.discord_id, trim(rn.name) AS role_name
    FROM org_members om
    JOIN users u ON u.id = om.user_id AND u.discord_id IS NOT NULL
    JOIN LATERAL unnest(string_to_array(COALESCE(om.roles, ''), ',')) AS rn(name) ON TRUE
   WHERE om.guild_id = $1 AND trim(rn.name) <> ''
),
role_members AS (
  SELECT rb.role_id, rb.role_name, rb.role_color, rb.group_name, rb.channel_ids,
         mr.user_id, mr.discord_id
    FROM role_base rb
    JOIN member_roles mr ON mr.role_name = rb.role_name
),
msg_agg AS (
  SELECT rm.role_id, rm.user_id,
         SUM(a.message_count) AS messages, SUM(a.voice_seconds) AS voice_seconds
    FROM role_members rm
    JOIN dc_activity_daily a
      ON a.guild_id = $1 AND a.user_id = rm.discord_id AND a.channel_id = ANY(rm.channel_ids)
     AND a.date >= CURRENT_DATE - $2::int * INTERVAL '1 day'
   GROUP BY rm.role_id, rm.user_id
),
mention_agg AS (
  SELECT rm.role_id, rm.user_id, COUNT(*) AS mentions
    FROM role_members rm
    JOIN dc_activity_mentions m
      ON m.guild_id = $1 AND m.user_id = rm.discord_id AND m.channel_id = ANY(rm.channel_ids)
     AND m.timestamp >= NOW() - $2::int * INTERVAL '1 day'
   GROUP BY rm.role_id, rm.user_id
),
scored AS (
  SELECT rm.role_id, rm.role_name, rm.role_color, rm.group_name, rm.user_id, rm.discord_id,
         COALESCE(ma.messages, 0)      AS messages,
         COALESCE(ma.voice_seconds, 0) AS voice_seconds,
         COALESCE(me.mentions, 0)      AS mentions,
         COALESCE(ma.messages, 0) * ${SCORE_MSG} + COALESCE(ma.voice_seconds, 0)
           + COALESCE(me.mentions, 0) * ${SCORE_MENTION} AS score
    FROM role_members rm
    LEFT JOIN msg_agg ma     ON ma.role_id = rm.role_id AND ma.user_id = rm.user_id
    LEFT JOIN mention_agg me ON me.role_id = rm.role_id AND me.user_id = rm.user_id
),
role_summary AS (
  SELECT role_id, COUNT(*) AS member_count, COALESCE(SUM(score), 0) AS total_score
    FROM scored
   GROUP BY role_id
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY role_id ORDER BY score DESC, messages DESC) AS rnk
    FROM scored
   WHERE score > 0
)
SELECT rb.role_id, rb.role_name, rb.role_color, rb.group_name,
       COALESCE(rs.member_count, 0) AS member_count,
       COALESCE(rs.total_score, 0)  AS total_score,
       r.user_id, u.discord_id, om.display_name, COALESCE(u.avatar, om.avatar) AS avatar,
       r.messages, r.voice_seconds, r.mentions, r.score, r.rnk
  FROM role_base rb
  LEFT JOIN role_summary rs ON rs.role_id = rb.role_id
  LEFT JOIN ranked r        ON r.role_id = rb.role_id AND r.rnk <= 10
  LEFT JOIN users u         ON u.id = r.user_id
  LEFT JOIN org_members om  ON om.user_id = r.user_id AND om.guild_id = $1
 ORDER BY rb.group_name, rb.role_id, r.rnk NULLS LAST
`

/**
 * ทุก role ที่ config ไว้ (dc_orgchart_config) ของ guild นี้ พร้อม top-10 คนแอคทีฟสุดต่อ role
 * (10 คน = เท่ากับ /panel orgchart ในดิสคอร์ด — ตัวเลขสองฝั่งต้องตรงกัน)
 * คืนเป็น groups: [{ groupName, roles: [{ roleId, roleName, roleColor, memberCount, totalScore, top: [...] }] }]
 * role ที่ยังไม่มีใครแอคทีฟเลยก็ยังอยู่ในผลลัพธ์ (memberCount อาจ > 0 แต่ top ว่าง)
 */
export async function getOrgChartData(guildId, days = 180) {
  const { rows } = await pool.query(SQL, [guildId, days])

  const roleMap = new Map()
  const groupOrder = []
  const groupRoles = new Map()

  for (const row of rows) {
    if (!roleMap.has(row.role_id)) {
      const role = {
        roleId: row.role_id,
        roleName: row.role_name,
        roleColor: row.role_color,
        memberCount: Number(row.member_count),
        totalScore: Number(row.total_score),
        top: [],
      }
      roleMap.set(row.role_id, role)
      if (!groupRoles.has(row.group_name)) { groupRoles.set(row.group_name, []); groupOrder.push(row.group_name) }
      groupRoles.get(row.group_name).push(role)
    }
    if (row.user_id) {
      roleMap.get(row.role_id).top.push({
        userId: row.user_id,
        discordId: row.discord_id,
        name: row.display_name || row.discord_id || row.user_id,
        avatar: row.avatar || null,
        messages: Number(row.messages),
        voiceSeconds: Number(row.voice_seconds),
        mentions: Number(row.mentions),
        score: Number(row.score),
      })
    }
  }

  return groupOrder.map(groupName => ({ groupName, roles: groupRoles.get(groupName) }))
}
