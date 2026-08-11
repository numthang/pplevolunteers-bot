// services/newsWatch.js — ดึงข่าวท้องถิ่นจาก Google News RSS แล้วสรุปลงห้อง Discord วันละ 2 รอบ
//
// ⚠️ คนละตัวกับ services/newsShare.js (อันนั้นแชร์โพสต์จากตะกร้าสื่อลงห้องข่าวสาร)
//
// ทำไมต้องเป็น RSS: FB/IG ค้นโพสต์สาธารณะตามคีย์เวิร์ดไม่ได้แล้ว (CrowdTangle ปิด ส.ค. 2024,
// Content Library ให้เฉพาะนักวิจัย) และ X ต้องจ่าย ~$200/เดือน · Google News RSS ฟรี ไม่ต้อง API key
// และดัชนีโพสต์ "เพจข่าวท้องถิ่นบน Facebook" ให้ด้วย (30% ของผลที่ได้) ซึ่งเป็นของที่มีค่าที่สุดสำหรับงานพื้นที่
//
// config ต่อ guild อยู่ใน dc_guild_config:
//   news_watch_feeds = [{ channelId, keywords }] — 1 guild มีได้หลายชุด (คนละห้อง คนละคำค้น)
//   news_watch_last_slot — กันส่งซ้ำตอนบอทรีสตาร์ท (ทุก feed ยิงในรอบเดียวกัน จึงเก็บระดับ guild)
const crypto = require('crypto');
const { EmbedBuilder, ChannelType } = require('discord.js');
const { getSetting, setSetting } = require('../db/settings');
const { getSeenKeys, markSeen, hasSeenAny, pruneSeen } = require('../db/newsWatch');
const { getT } = require('./i18n');
const {
    DEFAULT_KEYWORDS, BLOCKLIST, LOOKBACK_DAYS,
    MAX_ITEMS, FIRST_RUN_ITEMS, TITLE_MAX, SLOT_HOURS,
} = require('../config/newsWatch');

const TICK_MS = 5 * 60 * 1000;      // เช็คทุก 5 นาทีว่าถึงรอบหรือยัง (ไม่ใช่ยิงข่าวทุก 5 นาที)
const FETCH_TIMEOUT_MS = 15 * 1000;
const GAP_MS = 400;                 // เว้นระหว่างคำค้น ไม่รัวใส่ Google
const EMBED_CHARS = 3900;           // เพดานจริง 4096 — เผื่อไว้
const BRAND_ORANGE = 0xff6a13;

let timer = null;

// ── เวลา ────────────────────────────────────────────────────────────────────
// ⚠️ เซิร์ฟเวอร์รันเป็น UTC — ห้ามใช้ getHours() ตรงๆ ไม่งั้น 8:00 ไทยจะกลายเป็น 15:00
//    (โปรเจกต์นี้เคยโดนมาแล้วกับ txn_at ของ finance)
function bkkNow(d = new Date()) {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, x.value])
    );
    // hour12:false ใน en-US คืน "24" ตอนเที่ยงคืน (ควิร์กของ Intl) → หาร mod ทิ้ง
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

/** slot ล่าสุดที่ "ผ่านมาแล้ว" ของวันนี้ เช่น "2026-08-12-08" · null = ยังไม่ถึงรอบแรกของวัน */
function currentSlot(now = new Date()) {
    const { date, hour } = bkkNow(now);
    const passed = SLOT_HOURS.filter(h => hour >= h);
    if (!passed.length) return null;
    return `${date}-${String(passed[passed.length - 1]).padStart(2, '0')}`;
}

function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }).format(d);
    const { hour } = bkkNow(d);
    const min = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', minute: '2-digit' }).format(d);
    return `${day} ${String(hour).padStart(2, '0')}:${min.padStart(2, '0')}`;
}

// ── ดึง + แกะ RSS ───────────────────────────────────────────────────────────
function decodeEntities(s) {
    return String(s)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
        .replace(/&amp;/g, '&')   // ต้องท้ายสุด ไม่งั้น &amp;lt; แตกผิด
        .replace(/<[^>]+>/g, '')
        .trim();
}

const pick = (xml, tag) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? decodeEntities(m[1]) : '';
};

async function fetchFeed(query) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${LOOKBACK_DAYS}d`)}&hl=th&gl=TH&ceid=TH:th`;
    const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pple-volunteers-bot)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

function parseItems(xml) {
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
        const raw = m[1];
        const guid = pick(raw, 'guid') || pick(raw, 'link');
        return {
            // guid ยาวเฉลี่ย 360 ตัวอักษร (สูงสุด 1,425) → hash ก่อนเก็บ กันดัชนีบวม
            key: crypto.createHash('sha1').update(guid).digest('hex'),
            title: pick(raw, 'title'),
            link: pick(raw, 'link'),
            source: pick(raw, 'source') || '',
            pubDate: pick(raw, 'pubDate'),
        };
    }).filter(i => i.title && i.link);
}

// ── กรอง + ยุบข่าวซ้ำ ────────────────────────────────────────────────────────
const isBlocked = title => BLOCKLIST.some(w => title.includes(w));

// ⚠️ ยุบข่าวซ้ำด้วย trigram ของตัวอักษร ไม่ใช่ "เทียบ N คำแรก"
//    เพราะภาษาไทยไม่เว้นวรรคระหว่างคำ การตัดคำด้วย space ใช้ไม่ได้
//    ของจริงที่ต้องจับให้ได้: "ด่วน! ไฟไหม้โรงงานอะไหล่รถยนต์บ้านโป่ง" กับ
//    "ระทึก ไฟไหม้โรงงานบ้านโป่ง ราชบุรี" = ข่าวเดียวกันคนละสำนัก

// ⚠️ ต้องล้าง boilerplate ก่อนเทียบ ไม่งั้นยุบผิด — เจอของจริงตอนเทส 2026-08-12:
//    โพสต์ THE STANDARD 6 ชิ้นที่เป็นคนละข่าวกันโดนยุบรวม เพราะแชร์ "ชื่อเพจนำหน้า + แฮชแท็กท้าย"
//    ล้างแล้วคะแนนแยกขาด: ข่าวเดียวกันคนละสำนัก = 0.60 · คนละข่าวจากเพจเดียวกัน = 0.00–0.12
function normalizeTitle(s) {
    return s
        .replace(/#\S+/g, '')                 // แฮชแท็กท้ายโพสต์ FB
        .replace(/^.{0,30}?\.\s*\.\s*/, '')   // "THE STANDARD. . " ที่ Google ใส่นำหน้าโพสต์เพจ
        .replace(/\s+-\s+[^-]{1,30}$/, '')    // " - thestandard.co"
        .replace(/[\s\p{P}]/gu, '')
        .slice(0, 60);                        // เอาแค่ท่อนหัวข้อ ส่วนท้ายเป็นรายละเอียดที่ต่างกันเอง
}

function trigrams(s) {
    const out = new Set();
    for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
    return out;
}

/** Jaccard บน union — ห้ามใช้ min() เป็นตัวหาร ไม่งั้นหัวข้อสั้นที่อยู่ในหัวข้อยาวจะได้ 1.0 ทันที */
function similar(a, b) {
    const A = trigrams(normalizeTitle(a)), B = trigrams(normalizeTitle(b));
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const g of A) if (B.has(g)) hit++;
    return hit / (A.size + B.size - hit);
}

// วัดจากข้อมูลจริง 2026-08-12:
//   ควรยุบ → 0.173 (ไฟไหม้โรงงาน 2 สำนวน) · 0.181 (ศพบนราง) · 0.365 (GI) · 0.60 (พาดหัวใกล้กันมาก)
//   ห้ามยุบ → 0.00–0.12 (คนละข่าวจากเพจเดียวกัน) · 0.00–0.045 (คนละเรื่องคนละสำนัก)
// ⚠️ จงใจตั้งสูงไว้ที่ 0.35 ทั้งที่ทำให้ยุบไม่ครบ — ลดเป็น 0.15 จะกวาดได้หมดแต่เหลือระยะห่างจากเคส
//    "ห้ามยุบ" แค่ 0.03 = เปราะเกินไป · ยุบผิด = ข่าวหายจาก digest แบบเงียบๆ (แย่)
//    ยุบไม่ครบ = เห็นข่าวซ้ำ 2 บรรทัด (มองออกด้วยตา ไม่เสียหาย)
const SIMILAR_THRESHOLD = 0.35;

/** [{...item, dupes: n}] — เก็บชิ้นแรก (ใหม่สุด) เป็นตัวแทน แล้วนับที่เหลือเป็น dupes */
function cluster(items) {
    const groups = [];
    for (const it of items) {
        const hit = groups.find(g => similar(g.title, it.title) >= SIMILAR_THRESHOLD);
        if (hit) hit.dupes++;
        else groups.push({ ...it, dupes: 0 });
    }
    return groups;
}

// ── ประกอบข้อความ ───────────────────────────────────────────────────────────
function sourceLabel(src) {
    if (!src) return '';
    return /facebook\.com/i.test(src) ? 'Facebook' : src;
}

function line(item) {
    const title = item.title.length > TITLE_MAX ? `${item.title.slice(0, TITLE_MAX)}…` : item.title;
    // escape ] กับ ) ที่จะทำให้ markdown link แตก
    const safe = title.replace(/[[\]]/g, '').replace(/\)/g, '）');
    const meta = [sourceLabel(item.source), fmtTime(item.pubDate)].filter(Boolean).join(' · ');
    const dup = item.dupes ? ` (+${item.dupes})` : '';
    return `• [${safe}](${item.link})\n　${meta}${dup}`;
}

/** หั่นเป็นหลาย embed — บรรทัดละ ~500 ตัวอักษรเพราะลิงก์ Google News ยาวมาก */
function buildEmbeds(header, items) {
    const embeds = [];
    let buf = [];
    let len = 0;
    for (const it of items) {
        const l = line(it);
        if (len + l.length > EMBED_CHARS && buf.length) {
            embeds.push(buf.join('\n'));
            buf = []; len = 0;
        }
        buf.push(l); len += l.length + 1;
    }
    if (buf.length) embeds.push(buf.join('\n'));
    return embeds.map((desc, i) => new EmbedBuilder()
        .setColor(BRAND_ORANGE)
        .setDescription(desc)
        .setTitle(i === 0 ? header : null));
}

// ── ส่งของ ──────────────────────────────────────────────────────────────────
/**
 * ส่ง embed ลงปลายทาง — รองรับ 3 ชนิด
 *   Forum  → เปิดกระทู้ใหม่ 1 กระทู้ต่อรอบ (ห้อง Forum ส่งข้อความลอยๆ ไม่ได้ ทุกข้อความต้องอยู่ในกระทู้)
 *   เธรด   → ถ้าเธรดหลับ (archived) ต้องปลุกก่อน ไม่งั้น Discord ปฏิเสธข้อความ
 *   ห้องแชท → ส่งตรงๆ
 */
async function deliver(channel, embeds, header) {
    if (channel.type === ChannelType.GuildForum) {
        const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }).format(new Date());
        const thread = await channel.threads.create({
            name: `${header} · ${day}`.slice(0, 100),
            message: { embeds: [embeds[0]] },
        });
        for (const e of embeds.slice(1)) await thread.send({ embeds: [e] });
        return;
    }
    if (channel.isThread?.() && channel.archived) await channel.setArchived(false);
    for (const e of embeds) await channel.send({ embeds: [e] });
}

// ── งานหลัก ─────────────────────────────────────────────────────────────────
async function collectFor(keywords) {
    const seenInBatch = new Set();
    const all = [];
    for (const kw of keywords) {
        try {
            const items = parseItems(await fetchFeed(kw));
            for (const it of items) {
                if (seenInBatch.has(it.key)) continue;   // คำค้นคนละอันคืนข่าวเดียวกันได้
                seenInBatch.add(it.key);
                all.push(it);
            }
        } catch (err) {
            // คำค้นเดียวล้ม ไม่ควรล้มทั้งรอบ
            console.error(`[newsWatch] คำค้น "${kw}" ล้ม:`, err.message);
        }
        await new Promise(r => setTimeout(r, GAP_MS));
    }
    return all;
}

/** feed ทั้งหมดของ guild — [{ channelId, keywords }] · 1 ปลายทาง = 1 ชุดคำค้น */
async function getFeeds(guildId) {
    const v = await getSetting(guildId, 'news_watch_feeds');
    return Array.isArray(v) ? v.filter(f => f?.channelId) : [];
}

/**
 * รัน 1 รอบให้ 1 feed (1 ปลายทาง)
 * @returns {{sent:number, scanned:number, firstRun:boolean}}
 */
async function runFeed(client, guildId, feed) {
    const { channelId } = feed;
    const keywords = Array.isArray(feed.keywords) && feed.keywords.length ? feed.keywords : DEFAULT_KEYWORDS;

    const scanned = await collectFor(keywords);
    if (!scanned.length) return { sent: 0, scanned: 0, firstRun: false };

    // seen แยกตามปลายทาง — 2 ห้องที่คำค้นทับกันต้องได้ข่าวครบทั้งคู่ (คนละกลุ่มผู้อ่าน)
    const firstRun = !(await hasSeenAny(guildId, channelId));
    const seen = await getSeenKeys(guildId, channelId, scanned.map(i => i.key));

    const fresh = scanned
        .filter(i => !seen.has(i.key) && !isBlocked(i.title))
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    const picked = cluster(fresh).slice(0, firstRun ? FIRST_RUN_ITEMS : MAX_ITEMS);

    if (picked.length) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        // ⚠️ isTextBased() คืน false สำหรับห้อง Forum — ต้องเช็คแยก ไม่งั้น Forum ถูกตีว่าส่งไม่ได้
        const usable = channel?.isTextBased?.() || channel?.type === ChannelType.GuildForum;
        if (!usable) {
            console.error(`[newsWatch] guild ${guildId}: ปลายทาง ${channelId} หาไม่เจอหรือส่งข้อความไม่ได้`);
            return { sent: 0, scanned: scanned.length, firstRun };
        }
        const t = await getT(guildId);
        const { hour } = bkkNow();
        const header = t('newsWatch.digestTitle', {
            round: t(hour < 12 ? 'newsWatch.roundMorning' : 'newsWatch.roundEvening'),
        });
        try {
            // ส่งทีละ embed ต่อ 1 ข้อความ — เพดานรวมของ Discord คือ 6000 ตัวอักษร/ข้อความ
            // ซึ่งลิงก์ยาวๆ ทำให้เกินได้ง่ายถ้ายัดหลาย embed
            await deliver(channel, buildEmbeds(header, picked), header);
        } catch (err) {
            // เคสที่เจอบ่อยสุด: ห้อง Forum ที่ตั้งให้ "บังคับติดแท็ก" → สร้างกระทู้ไม่ผ่าน
            console.error(`[newsWatch] ส่งลง ${channelId} ไม่สำเร็จ:`, err.message);
            return { sent: 0, scanned: scanned.length, firstRun };
        }
    }

    // จำ "ทุกชิ้นที่เห็น" รวมที่ถูกกรองทิ้ง ไม่งั้นรอบหน้ามันกลับมาใหม่
    await markSeen(guildId, channelId, scanned);
    return { sent: picked.length, scanned: scanned.length, firstRun };
}

/** รันทุก feed ของ guild — feed เดียวล้มไม่ควรทำให้ feed อื่นไม่ได้ข่าว */
async function runForGuild(client, guildId, only = null) {
    const feeds = (await getFeeds(guildId)).filter(f => !only || f.channelId === only);
    let sent = 0, scanned = 0;
    for (const feed of feeds) {
        try {
            const r = await runFeed(client, guildId, feed);
            sent += r.sent; scanned += r.scanned;
        } catch (err) {
            console.error(`[newsWatch] feed ${feed.channelId}:`, err.message);
        }
    }
    return { sent, scanned, feeds: feeds.length };
}

/** เรียกตอนถึงรอบ (8:00/17:00) — ไล่ทุก guild ที่ตั้ง feed ไว้ */
async function runOnce(client) {
    const slot = currentSlot();
    if (!slot) return;   // ยังไม่ถึงรอบแรกของวัน

    for (const guildId of client.guilds.cache.keys()) {
        try {
            if (!(await getFeeds(guildId)).length) continue;
            if (await getSetting(guildId, 'news_watch_last_slot') === slot) continue;

            await runForGuild(client, guildId);
            // เขียน last_slot หลังส่งสำเร็จเท่านั้น — ถ้าล้มกลางทางให้ tick ถัดไปลองใหม่
            await setSetting(guildId, 'news_watch_last_slot', slot);
        } catch (err) {
            console.error(`[newsWatch] guild ${guildId}:`, err.message);
        }
    }
    await pruneSeen().catch(err => console.error('[newsWatch] prune:', err.message));
}

function startNewsWatch(client) {
    if (timer) return;
    const tick = () => runOnce(client).catch(err => console.error('[newsWatch]', err.message));
    timer = setInterval(tick, TICK_MS);
    tick();   // บอทรีสตาร์ทหลังเลยรอบ → ตามส่งให้ (กันซ้ำด้วย news_watch_last_slot)
    console.log(`[newsWatch] เริ่มทำงาน (เช็คทุก ${TICK_MS / 60000} นาที · ส่ง ${SLOT_HOURS.join(':00, ')}:00 น.)`);
}

function stopNewsWatch() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = {
    startNewsWatch, stopNewsWatch, runOnce, runForGuild, runFeed, getFeeds,
    currentSlot, bkkNow, cluster, similar, parseItems, buildEmbeds, deliver,
};
