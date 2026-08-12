// db/aiPrompts.js — อ่าน prompt ฝั่ง **บอท** (CommonJS) จาก org_ai_prompts
// คู่แฝดฝั่งเว็บคือ web/db/orgAiPrompts.js (ESM) — แก้ที่นึงต้องดูอีกที่ด้วยเสมอ
//
// สายการอ่าน: แถวของ org → แถวกลาง (org_id IS NULL) → ค่าใน config/aiPrompts.js
// DB ล่ม/ตารางว่าง → ค่าโค้ด (AI ต้องไม่พังเพราะ config เสีย — กฎเดียวกับ db/aiConfig.js เดิม)
const pool = require('./index');
const { defaultPrompt } = require('../config/aiPrompts');
const { orgIdOfGuild } = require('./org');

/**
 * prompt ของช่องที่ผูกกับโค้ด (kind='slot')
 * @param {string} value  เช่น 'case.timeline'
 * @param {{orgId?:number, guildId?:string}} ctx  ส่ง guildId มาได้ ระบบแปลงเป็น org ให้เอง
 * @returns {Promise<string|null>} null = ไม่รู้จักช่องนี้เลย (สะกดผิด)
 */
async function getPrompt(value, ctx = {}) {
  const fallback = defaultPrompt(value)?.prompt ?? null;

  let orgId = ctx.orgId ?? null;
  try {
    if (orgId == null && ctx.guildId) orgId = await orgIdOfGuild(ctx.guildId);

    const { rows } = await pool.query(
      // org_id ASC NULLS LAST → แถวของ org มาก่อนแถวกลางเสมอ · orgId=null จะแมตช์เฉพาะแถวกลาง
      `SELECT prompt FROM org_ai_prompts
        WHERE value = $1 AND kind = 'slot' AND (org_id = $2 OR org_id IS NULL)
        ORDER BY org_id ASC NULLS LAST
        LIMIT 1`,
      [value, orgId]
    );
    return rows[0]?.prompt ?? fallback;
  } catch (err) {
    console.error('[aiPrompts] getPrompt failed, fallback to code:', err.message);
    return fallback;
  }
}

module.exports = { getPrompt };
