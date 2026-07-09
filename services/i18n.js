// services/i18n.js — ระบบแปลภาษาของ bot
// locale ต่อ guild อ่านจาก dc_guild_config key `locale` ผ่าน resolveConfig (guild > global) → default 'th'
// การใช้: const t = await getT(interaction.guildId); t('common.error')
// interpolation: t('gogo.joined', { name: 'สมชาย' }) กับ string "คุณ {name} เข้าร่วมแล้ว"
const { resolveConfig } = require('../db/configResolver');

const LOCALES = {
    th: require('../locales/th.json'),
    en: require('../locales/en.json'),
};
const DEFAULT_LOCALE = 'th';

// cache locale ต่อ guild — กัน query DB ทุก interaction
const cache = new Map(); // guildId → { locale, at }
const TTL_MS = 5 * 60 * 1000;

function lookup(locale, key) {
    let node = LOCALES[locale];
    for (const part of key.split('.')) node = node?.[part];
    if (typeof node !== 'string' && locale !== DEFAULT_LOCALE) return lookup(DEFAULT_LOCALE, key);
    return node;
}

// sync — ใช้เมื่อรู้ locale อยู่แล้ว
function t(locale, key, vars) {
    const str = lookup(locale, key);
    if (typeof str !== 'string') return key; // key หาย → คืน key ให้เห็นชัดตอน dev
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, name) => vars[name] ?? m);
}

async function getGuildLocale(guildId) {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.locale;
    let locale = DEFAULT_LOCALE;
    try {
        const { value } = await resolveConfig(null, guildId, 'locale');
        if (LOCALES[value]) locale = value;
    } catch (err) {
        console.error('i18n getGuildLocale:', err.message); // DB ล่ม → default th ไม่พังงาน
    }
    cache.set(guildId, { locale, at: Date.now() });
    return locale;
}

// helper หลัก — คืน t ที่ bind locale ของ guild แล้ว
async function getT(guildId) {
    const locale = await getGuildLocale(guildId);
    return (key, vars) => t(locale, key, vars);
}

function clearLocaleCache(guildId) {
    if (guildId) cache.delete(guildId);
    else cache.clear();
}

module.exports = { getT, getGuildLocale, t, clearLocaleCache, DEFAULT_LOCALE };
