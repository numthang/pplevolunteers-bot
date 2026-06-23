#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { load } = require('cheerio')
const pool = require('../db')

const BASE_URL = 'https://act.pplethai.org'
const PROVINCE_BASE_URL = 'https://act.peoplesparty.or.th'
const MAX_PAGES = 20
const CUTOFF_MONTHS = 2
const GUILD_ID = process.env.GUILD_ID || '1'
const DELAY_MS = 600

// Province IDs from CLI args, e.g. node sync-act-events.js 71 80
const PROVINCES = process.argv.slice(2).map(Number).filter(n => n > 0)

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

function scrapeEventIds(html) {
  const $ = load(html)
  const ids = new Set()
  $('a[href*="/event/"]').each((_, el) => {
    const m = $(el).attr('href')?.match(/\/event\/(\d+)\//)
    if (m) ids.add(parseInt(m[1]))
  })
  return [...ids]
}

async function getEventIdsFromPage(page) {
  const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`
  return scrapeEventIds(await fetchHtml(url))
}

async function getEventIdsFromProvincePage(province, page) {
  const url = page === 1
    ? `${PROVINCE_BASE_URL}/?province=${province}`
    : `${PROVINCE_BASE_URL}/page/${page}/?province=${province}`
  return scrapeEventIds(await fetchHtml(url))
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

// Paginate through a source until cutoff or no new IDs. seenIds shared across all sources.
async function syncPages(label, getPageFn, { cutoff, freshMap, seenIds }) {
  let done = 0, skipped = 0, errors = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    process.stdout.write(`\r${label} — page ${page}...`)
    const pageIds = await getPageFn(page)
    const newIds = pageIds.filter(id => !seenIds.has(id))
    newIds.forEach(id => seenIds.add(id))

    if (newIds.length === 0) {
      console.log(`\n  No new IDs on page ${page}, stopping`)
      break
    }

    let pageHasRecent = false
    for (const id of newIds) {
      if (freshMap.has(id)) {
        const cachedDate = freshMap.get(id)
        if (!cachedDate || new Date(cachedDate) >= cutoff) pageHasRecent = true
        skipped++
        continue
      }
      try {
        const detail = await getEventDetail(id)
        const eventDate = detail.event_date ? new Date(detail.event_date) : null
        if (!eventDate || eventDate >= cutoff) {
          pageHasRecent = true
          await upsert(id, detail)
          done++
        }
        process.stdout.write(`\r  ${label} — ${done} synced, ${skipped} fresh, ${errors} errors  `)
      } catch (err) {
        errors++
        process.stderr.write(`\n  Error event ${id}: ${err.message}\n`)
      }
    }

    if (!pageHasRecent) {
      console.log(`\n  Page ${page}: all events older than ${CUTOFF_MONTHS} months, stopping`)
      break
    }
  }

  return { done, skipped, errors }
}

async function main() {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - CUTOFF_MONTHS)

  const { rows: fresh } = await pool.query(
    `SELECT act_event_id, event_date FROM act_event_cache
     WHERE type = 'event' AND act_event_id IS NOT NULL AND synced_at > NOW() - INTERVAL '23 hours'`
  )
  const freshMap = new Map(fresh.map(r => [r.act_event_id, r.event_date]))
  const seenIds = new Set()
  const ctx = { cutoff, freshMap, seenIds }

  let totalDone = 0, totalSkipped = 0, totalErrors = 0

  console.log('=== Global sync ===')
  const g = await syncPages('Global', page => getEventIdsFromPage(page), ctx)
  totalDone += g.done; totalSkipped += g.skipped; totalErrors += g.errors

  for (const province of PROVINCES) {
    console.log(`\n=== Province ${province} ===`)
    const p = await syncPages(`Province ${province}`, page => getEventIdsFromProvincePage(province, page), ctx)
    totalDone += p.done; totalSkipped += p.skipped; totalErrors += p.errors
  }

  console.log(`\nDone: ${totalDone} synced, ${totalSkipped} skipped (fresh), ${totalErrors} errors at ${new Date().toLocaleString('th-TH')}`)
  await pool.end()
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
