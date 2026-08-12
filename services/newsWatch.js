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
const { ChannelType, MessageFlags } = require('discord.js');
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
const MSG_CHARS = 1900;             // เพดานข้อความธรรมดาของ Discord คือ 2,000 — เผื่อไว้

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

// ── แปลงลิงก์ Google News → URL จริงของข่าว ─────────────────────────────────
// ⚠️ ลิงก์ใน RSS (`news.google.com/rss/articles/CBMi…`) **เปิดแล้วไม่เจอเนื้อข่าว**
//    (user เจอเองตอนกดจริง 2026-08-12) — Google ซ่อน URL ปลายทางไว้หลัง JS ทั้งหมด:
//    decode base64 ไม่ได้ · ตาม redirect ก็วนอยู่ที่ news.google.com · ในหน้าไม่มี URL สำนักข่าวเลย
//    ทางเดียวที่ได้ผลคือหยิบ signature/timestamp จากหน้า แล้วยิง batchexecute ต่อ (เทส 6/6 ผ่าน · 0.4 วิ/ข่าว)
//    ของแถม: URL จริงสั้นกว่า ~8 เท่า (50 ตัวอักษร เทียบกับ 398) ข้อความเลยไม่ชนเพดาน 2,000 อีก
// ⚠️ นี่คือ endpoint ภายในของ Google — พังได้ทุกเมื่อ · ถ้าพังต้อง **ตกกลับไปใช้ลิงก์เดิม** ไม่ใช่ทิ้งข่าว
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function resolveLink(link) {
    const id = link.split('/articles/')[1]?.split('?')[0];
    if (!id) return link;

    const page = await (await fetch(link, {
        headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })).text();
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return link;

    const req = JSON.stringify([[['Fbv4je', JSON.stringify(['garturlreq',
        [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
            'en-US', 'US', 1, [2, 3, 4, 8], 1, 0, '655000234', 0, 0, null, 0],
        id, Number(ts), sg]), null, '1']]]);

    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
        method: 'POST',
        headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ 'f.req': req }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const found = (await res.text()).match(/https?:\/\/(?!(?:www\.)?(?:google|gstatic))[^\s\\"]+/);
    return found ? found[0] : link;
}

/** แปลงลิงก์ให้เฉพาะข่าวที่จะส่งจริง (5 ชิ้น) — ตัวไหนแปลงไม่ได้ก็ใช้ลิงก์เดิมไป ไม่ทิ้งข่าว */
async function resolveLinks(items) {
    return Promise.all(items.map(async it => ({
        ...it,
        link: await resolveLink(it.link).catch(err => {
            console.error('[newsWatch] แปลงลิงก์ไม่ได้:', err.message);
            return it.link;
        }),
    })));
}

// ── กรอง + ยุบข่าวซ้ำ ────────────────────────────────────────────────────────
// เทียบแบบไม่สนตัวพิมพ์ — คำอังกฤษในสแปม (UFABET / Pre-Season) เขียนสลับเคสตลอด
const isBlocked = title => {
    const t = title.toLowerCase();
    return BLOCKLIST.some(w => t.includes(w.toLowerCase()));
};

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

// ⛔ **เคยใช้ trigram Jaccard แล้วไม่พอ — อย่าถอยกลับไป** (user เจอของจริง 2026-08-12:
//    "เปิดแล้วมีแต่ข่าวขยะ" เพราะข่าวเดียวกันโผล่ซ้ำ 5 บรรทัด)
//    วัดจากกองจริง 37 ข่าว: ต่อให้ลดเกณฑ์ trigram ลงสุดๆ ถึง 0.12 ข่าว "เนวิน-บุญยิ่ง"
//    ก็ยังแตกเป็น 6 กลุ่ม เพราะแต่ละสำนักพาดหัวคนละสำนวนสิ้นเชิง
//    ("สะพัด เนวิน พบ บุญยิ่ง" vs "อนุทิน งง งูเขียว เข้า ภท.") ตัวอักษรแทบไม่ซ้ำกันเลย
//
// วิธีที่ใช้แทน: จับกลุ่มด้วย **n-gram ที่หายากในกองนั้น** — ชื่อเฉพาะอย่าง "เนวิน"/"บุญยิ่ง"/"งูเขียว"
// โผล่ไม่กี่ข่าว (หายาก = มีความหมาย) ส่วน "ราชบุรี" โผล่แทบทุกข่าว (ไม่มีความหมาย ตัดทิ้ง)
// ผลบนกองเดียวกัน: 26 ข่าว → 7 กลุ่ม (trigram ได้ 21 กลุ่ม) และยุบ "เนวิน" 8 ชิ้นเป็นก้อนเดียวได้
const GRAM_LEN = 5;        // grid search แล้ว 5 ดีกว่า 6 (6 ยุบไม่ค่อยลง)
const MIN_SHARED = 4;      // แชร์ n-gram หายากกี่ตัวถึงนับเป็นข่าวเดียวกัน · 3 = ยุบผิด (เอาข่าวจับคนไปรวมกับไฟไหม้)
const RARE_RATIO = 0.35;   // n-gram ที่โผล่เกิน 35% ของกอง = คำพื้นๆ ของกองนั้น ตัดทิ้ง

function grams(s) {
    const c = normalizeTitle(s);
    const out = new Set();
    for (let i = 0; i + GRAM_LEN <= c.length; i++) out.add(c.slice(i, i + GRAM_LEN));
    return out;
}

/**
 * [{...item, dupes: n}] — เก็บชิ้นแรก (ใหม่สุด) เป็นตัวแทน แล้วนับที่เหลือเป็น dupes
 * "หายาก" คิดจากกองที่ส่งเข้ามารอบนั้นๆ ไม่ใช่ค่าคงที่ — คำที่พบบ่อยในกองย่อมไม่ช่วยแยกข่าว
 */
function cluster(items) {
    const sets = items.map(i => grams(i.title));
    const df = new Map();
    for (const s of sets) for (const g of s) df.set(g, (df.get(g) ?? 0) + 1);
    const rareMax = Math.ceil(items.length * RARE_RATIO);

    const groups = [];
    items.forEach((it, idx) => {
        const mine = [...sets[idx]].filter(g => df.get(g) <= rareMax);
        const hit = groups.find(g => {
            let n = 0;
            for (const x of mine) if (g.keys.has(x) && ++n >= MIN_SHARED) return true;
            return false;
        });
        if (hit) hit.dupes++;
        else groups.push({ ...it, dupes: 0, keys: new Set(mine) });
    });
    return groups.map(({ keys, ...rest }) => rest);
}

// ── ประกอบข้อความ ───────────────────────────────────────────────────────────
function sourceLabel(src) {
    if (!src) return '';
    return /facebook\.com/i.test(src) ? 'Facebook' : src;
}

/** ตัด " - ชื่อสำนัก" ท้ายหัวข้อ — ซ้ำกับชื่อสำนักที่โชว์ในบรรทัดล่างอยู่แล้ว */
function stripSourceSuffix(title, source) {
    if (!source) return title;
    const tail = title.match(/\s+-\s+([^-]{1,30})$/);
    return tail && tail[1].trim().toLowerCase() === source.trim().toLowerCase()
        ? title.slice(0, tail.index)
        : title;
}

/**
 * ลิงก์โพสต์ Facebook มี slug ภาษาไทยที่ถูก percent-encode จนยาว ~500 ตัวอักษร
 * (กินโควตาข้อความไปหนึ่งในสาม) — เหลือแค่เลข id ก็เปิดได้เหมือนกัน
 */
function shortenLink(url) {
    return url.replace(/^(https:\/\/(?:www\.)?facebook\.com\/[^/]+\/posts\/).*?(\d{10,})\/?$/, '$1$2');
}

/** หัวข้อข่าวคือตัวสรุปอยู่แล้ว (RSS ไม่ได้ให้เนื้อข่าวมา) → ตัวหนาเป็นสรุป · ลิงก์เล็กๆ ต่อท้าย */
function line(item) {
    const full = stripSourceSuffix(item.title, item.source);
    const title = full.length > TITLE_MAX ? `${full.slice(0, TITLE_MAX)}…` : full;
    // ตัด * ` _ ที่จะทำให้ markdown ตัวหนาแตก
    const safe = title.replace(/[*`_]/g, '');
    const meta = [sourceLabel(item.source), fmtTime(item.pubDate)].filter(Boolean).join(' · ');
    const dup = item.dupes ? ` (+${item.dupes})` : '';
    return `**${safe}**\n-# ${meta} · [ลิงก์](${shortenLink(item.link)})${dup}`;
}

/** หั่นเป็นหลายข้อความ — เพดานข้อความธรรมดาของ Discord คือ 2,000 ตัวอักษร */
function buildMessages(header, items) {
    const msgs = [];
    let buf = [];
    let len = 0;
    for (const it of items) {
        const l = line(it);
        if (len + l.length > MSG_CHARS && buf.length) {
            msgs.push(buf.join('\n'));
            buf = []; len = 0;
        }
        buf.push(l); len += l.length + 2;
    }
    if (buf.length) msgs.push(buf.join('\n\n'));
    return msgs.map((body, i) => (i === 0 ? `## ${header}\n\n${body}` : body));
}

// ── ส่งของ ──────────────────────────────────────────────────────────────────
/**
 * ส่ง embed ลงปลายทาง — รองรับ 3 ชนิด
 *   Forum  → เปิดกระทู้ใหม่ 1 กระทู้ต่อรอบ (ห้อง Forum ส่งข้อความลอยๆ ไม่ได้ ทุกข้อความต้องอยู่ในกระทู้)
 *   เธรด   → ถ้าเธรดหลับ (archived) ต้องปลุกก่อน ไม่งั้น Discord ปฏิเสธข้อความ
 *   ห้องแชท → ส่งตรงๆ
 */
async function deliver(channel, messages, header) {
    // ⚠️ SuppressEmbeds เสมอ — ข้อความธรรมดาที่มีลิงก์ Discord จะแปะการ์ดพรีวิวให้เอง
    //    5 ลิงก์ = การ์ดรก 5 ใบ กลบเนื้อหาที่ตั้งใจให้อ่าน
    const opts = body => ({ content: body, flags: MessageFlags.SuppressEmbeds });

    if (channel.type === ChannelType.GuildForum) {
        const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }).format(new Date());
        const thread = await channel.threads.create({
            name: `${header} · ${day}`.slice(0, 100),
            message: opts(messages[0]),
        });
        for (const m of messages.slice(1)) await thread.send(opts(m));
        return;
    }
    if (channel.isThread?.() && channel.archived) await channel.setArchived(false);
    for (const m of messages) await channel.send(opts(m));
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
            // แปลงลิงก์ **หลังคัดเหลือ 5 ชิ้นแล้วเท่านั้น** — ยิง 2 request ต่อข่าว
            // ถ้าไปแปลงตั้งแต่ตอนสแกน (36 ชิ้น) = 72 request ทิ้งเปล่าทุกรอบ
            await deliver(channel, buildMessages(header, await resolveLinks(picked)), header);
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
    currentSlot, bkkNow, cluster, parseItems, buildMessages, deliver, resolveLink,
};
