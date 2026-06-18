#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { load } = require('cheerio')
const pool = require('../db')

const BASE_URL = 'https://act.pplethai.org'
const PAGES = 3
const GUILD_ID = process.env.GUILD_ID || '1'
const DELAY_MS = 600

const THAI_MONTHS = {
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4,
  พฤษภาคม: 5, มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8,
  กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function parseThaiDatetime(dateStr, timeStr) {
  const m = dateStr.trim().match(/(\d+)\s+(\S+)\s+(\d+)/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = String(THAI_MONTHS[m[2]] || 1).padStart(2, '0')
  const year = parseInt(m[3]) - 543
  const time = (timeStr || '00:00').replace(/\s*น\.?$/, '').trim()
  return `${year}-${month}-${day}T${time}:00+07:00`
}

async function fetchHtml(url) {
  await sleep(DELAY_MS)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pple-volunteers-sync/1.0)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function getEventIdsFromPage(page) {
  const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`
  const html = await fetchHtml(url)
  const $ = load(html)
  const ids = new Set()
  $('a[href*="/event/"]').each((_, el) => {
    const m = $(el).attr('href')?.match(/\/event\/(\d+)\//)
    if (m) ids.add(parseInt(m[1]))
  })
  return [...ids]
}

async function getEventDetail(actEventId) {
  const html = await fetchHtml(`${BASE_URL}/event/${actEventId}/`)
  const $ = load(html)

  const ACT_DEFAULT = 'https://act.pplethai.org/wp-content/uploads/2024/09/act-pple-cover.jpg'
  const FALLBACK_IMAGE = 'https://act.pplethai.org/wp-content/uploads/2024/09/pple-cover-yt.jpg'
  const rawImage = $('meta[property="og:image"]').attr('content') || null
  const ogImage = !rawImage || rawImage === ACT_DEFAULT ? FALLBACK_IMAGE : rawImage

  const name = $('h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.replace(/ - PPLE Act$/, '').trim()
    || null

  const province = $('a[href*="?province="]').first().text().trim() || null

  let dateStr = '', startTime = '', endTime = ''
  $('i.fa-calendar').each((_, el) => {
    const text = $(el).parent().text().trim()
    const m = text.match(/(\d+\s+\S+\s+\d{4})/)
    if (m) dateStr = m[1]
  })
  $('i.fa-clock').each((_, el) => {
    const text = $(el).parent().text().trim()
    const range = text.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/)
    if (range) { startTime = range[1]; endTime = range[2] }
    else {
      const single = text.match(/(\d{2}:\d{2})/)
      if (single) startTime = single[1]
    }
  })

  let location = null, map_url = null
  $('i.fa-location-dot').each((_, el) => {
    const parent = $(el).parent()
    map_url = parent.find('a[href*="maps.app.goo.gl"]').attr('href') || null
    const clone = parent.clone()
    clone.find('a').remove()
    const text = clone.text().replace(/\s+/g, ' ').trim()
    if (text) location = text
  })

  const description = $('.event-detail-p .-inner').text().replace(/\s+/g, ' ').trim() || null

  return {
    name,
    province,
    location,
    map_url,
    description,
    event_date: dateStr ? parseThaiDatetime(dateStr, startTime) : null,
    event_end_date: dateStr && endTime ? parseThaiDatetime(dateStr, endTime) : null,
    image_url: ogImage,
  }
}

async function upsert(actEventId, data) {
  await pool.query(
    `INSERT INTO act_event_cache
       (type, act_event_id, name, province, description, location, map_url, event_date, event_end_date, image_url, guild_id, synced_at)
     VALUES ('event', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (act_event_id) WHERE act_event_id IS NOT NULL
     DO UPDATE SET
       name           = EXCLUDED.name,
       province       = EXCLUDED.province,
       description    = EXCLUDED.description,
       location       = EXCLUDED.location,
       map_url        = EXCLUDED.map_url,
       event_date     = EXCLUDED.event_date,
       event_end_date = EXCLUDED.event_end_date,
       image_url      = EXCLUDED.image_url,
       synced_at      = NOW(),
       updated_at     = NOW()`,
    [actEventId, data.name, data.province, data.description, data.location,
     data.map_url, data.event_date, data.event_end_date, data.image_url, GUILD_ID]
  )
}

async function main() {
  const { rows: fresh } = await pool.query(
    `SELECT act_event_id FROM act_event_cache
     WHERE type = 'event' AND act_event_id IS NOT NULL AND synced_at > NOW() - INTERVAL '23 hours'`
  )
  const freshIds = new Set(fresh.map(r => r.act_event_id))

  const allIds = []
  for (let page = 1; page <= PAGES; page++) {
    process.stdout.write(`\rFetching listing page ${page}/${PAGES}...`)
    const ids = await getEventIdsFromPage(page)
    ids.forEach(id => { if (!allIds.includes(id)) allIds.push(id) })
  }
  console.log(`\nFound ${allIds.length} events on ${PAGES} pages`)

  const toFetch = allIds.filter(id => !freshIds.has(id))
  console.log(`Syncing ${toFetch.length} (${allIds.length - toFetch.length} fresh, skipped)`)

  let done = 0, errors = 0
  for (const id of toFetch) {
    try {
      const detail = await getEventDetail(id)
      await upsert(id, detail)
      done++
      process.stdout.write(`\r  ${done}/${toFetch.length} (${errors} errors)`)
    } catch (err) {
      errors++
      process.stderr.write(`\n  Error event ${id}: ${err.message}\n`)
    }
  }

  console.log(`\nDone: ${done} synced, ${errors} errors at ${new Date().toLocaleString('th-TH')}`)
  await pool.end()
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
