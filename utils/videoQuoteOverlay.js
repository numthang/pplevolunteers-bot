// utils/videoQuoteOverlay.js — เบิร์นคำคมลงบนคลิป (ffmpeg + ชั้นข้อความจาก quoteStyles.js)
//
// ทำไมไม่ใช้ ffmpeg `drawtext`: มันตัดบรรทัดภาษาไทยไม่เป็น (ไม่มี grapheme segmentation)
// และย่อฟอนต์ให้พอกล่องไม่ได้ → วาดข้อความด้วย canvas เป็น PNG โปร่งใสแล้วให้ ffmpeg ซ้อนแทน
// ตัววาดคือ `renderQuoteOverlay()` ใน utils/quoteStyles.js — **renderer ตัวเดียวกับการ์ดคำคม**
//
// ⚠️ ที่นี่คือที่เดียวที่รู้เรื่อง "ขนาดที่ตาเห็น vs ขนาด coded" ของคลิป — ดู normalizeRotation()
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const { renderQuoteOverlay } = require('./quoteStyles');

/** รันคำสั่งแล้วคืน stdout · ล้ม = โยนพร้อม stderr ท้ายๆ (ffmpeg พ่นยาวมาก เอาแค่ที่มีประโยชน์) */
function run(cmd, args, { onStderr = null } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; if (onStderr) onStderr(String(d)); });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) return resolve(out);
      reject(new Error(`${cmd} ออกด้วยรหัส ${code}: ${err.trim().split('\n').slice(-3).join(' · ')}`));
    });
  });
}

/**
 * แปลงค่า rotation จาก ffprobe ให้เป็น "องศาตามเข็มที่ต้องหมุนก่อนแสดง"
 *
 * มี 2 ที่เก็บและ**เครื่องหมายกลับกัน**: tag `rotate` = องศาตามเข็ม · side_data `rotation` = ทวนเข็ม
 * (mp4 สมัยใหม่ใช้ side_data · ไฟล์เก่าใช้ tag)
 */
function normalizeRotation({ tagRotate, sideRotation }) {
  const raw = tagRotate != null ? Number(tagRotate)
    : sideRotation != null ? -Number(sideRotation)
    : 0;
  return Number.isFinite(raw) ? ((raw % 360) + 360) % 360 : 0;
}

/**
 * อ่านสเปกคลิป — คืน**ขนาดที่ตาเห็น** ไม่ใช่ขนาดที่เก็บในไฟล์
 *
 * คลิปแนวตั้งจากมือถือมักเก็บเป็น 1920×1080 + rotation 90 · ถ้าเอา width/height ดิบไปสร้าง overlay
 * ข้อความจะไปโผล่ผิดที่ทั้งใบ (นี่คือกับดักหลักของฟีเจอร์นี้)
 */
async function probeVideo(absPath) {
  // ⚠️ ต้องใช้ `-show_streams` — เคยเขียนเป็น `-show_entries ...:side_data=rotation`
  //    แล้ว ffprobe ไล่ dump ทุก packet/frame ของทั้งคลิปออกมา (เอาต์พุตหลายหมื่นบรรทัด)
  const json = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', absPath]);
  const data = JSON.parse(json);
  const st = (data.streams || []).find(s => s.codec_type === 'video');
  if (!st) throw new Error('อ่านสตรีมวิดีโอไม่ได้ — ไฟล์อาจไม่ใช่วิดีโอ');
  // mov จากกล้องบางตัวเป็น pcm ซึ่งใส่ mp4 ตรงๆ ไม่ได้ → ต้องรู้ codec ก่อนตัดสินใจ copy/encode
  const audioCodec = (data.streams || []).find(s => s.codec_type === 'audio')?.codec_name || null;

  const rotation = normalizeRotation({
    tagRotate: st.tags?.rotate,
    sideRotation: st.side_data_list?.find(s => s.rotation != null)?.rotation,
  });
  const swap = rotation === 90 || rotation === 270;

  return {
    codedWidth: st.width,
    codedHeight: st.height,
    width: swap ? st.height : st.width,     // ← ขนาดที่ตาเห็น ใช้ตัวนี้สร้าง overlay เสมอ
    height: swap ? st.width : st.height,
    duration: Number(st.duration || data.format?.duration || 0),
    rotation,
    codec: st.codec_name,
    audioCodec,
  };
}

/** filter หมุนภาพให้ตรงกับที่ตาเห็น — ffmpeg 4.4 **ไม่ autorotate ให้ใน -filter_complex** */
function rotationFilter(rotation) {
  if (rotation === 90) return 'transpose=1';
  if (rotation === 270) return 'transpose=2';
  if (rotation === 180) return 'hflip,vflip';
  return null;
}

/**
 * เบิร์นคำคมลงคลิป → เขียนไฟล์ใหม่ที่ `outAbsPath`
 *
 * @param {object} o
 * @param {string} o.videoAbsPath   คลิปต้นทาง
 * @param {string} o.outAbsPath     ไฟล์ผลลัพธ์ (.mp4)
 * @param {string} o.quoteText
 * @param {string} [o.authorName]
 * @param {'top'|'center'|'bottom'} [o.position]
 * @param {number} [o.maxSeconds]   ยาวเกินนี้ = ไม่ยอมเรนเดอร์ (กันงานที่กินเวลาเป็นนาที)
 * @param {(pct:number)=>void} [o.onProgress]  0–100 (ประมาณจาก time= ใน stderr ของ ffmpeg)
 * @returns {Promise<{duration:number, width:number, height:number, rotation:number}>}
 */
async function renderVideoQuote({
  videoAbsPath, outAbsPath, quoteText, authorName = '',
  position = 'bottom', maxSeconds = 180, onProgress = null,
}) {
  if (!quoteText?.trim()) throw new Error('ไม่มีข้อความคำคม');

  const info = await probeVideo(videoAbsPath);
  if (maxSeconds && info.duration > maxSeconds) {
    throw new Error(`คลิปยาว ${Math.round(info.duration)} วิ เกินที่รองรับ (${maxSeconds} วิ)`);
  }

  // overlay สร้างที่ "ขนาดที่ตาเห็น" แล้วเราหมุนภาพให้ตรงกันก่อน overlay
  const png = await renderQuoteOverlay(info.width, info.height, { quoteText, authorName, position });
  const pngPath = path.join(os.tmpdir(), `quoteov-${randomUUID()}.png`);
  await fs.writeFile(pngPath, png);

  const rot = rotationFilter(info.rotation);
  const chain = rot
    ? `[0:v]${rot}[r];[r][1:v]overlay=0:0[out]`
    : `[0:v][1:v]overlay=0:0[out]`;

  const args = [
    '-n', '19', 'ffmpeg', '-y',
    '-i', videoAbsPath, '-i', pngPath,
    '-filter_complex', chain,
    '-map', '[out]',
    // เสียง: มีก็เอามาด้วย (`?` = ไม่มีก็ไม่ล้ม) · copy ได้เฉพาะ aac ที่ mp4 รับตรงๆ
    '-map', '0:a?',
    ...(info.audioCodec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    // หมุนเองแล้ว → ต้องล้าง metadata ทิ้ง ไม่งั้นเครื่องเล่นหมุนซ้ำอีกรอบ
    '-metadata:s:v:0', 'rotate=0',
    outAbsPath,
  ];

  try {
    await run('nice', args, {
      onStderr: onProgress && info.duration
        ? chunk => {
            const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(chunk);
            if (!m) return;
            const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
            onProgress(Math.min(99, Math.round((sec / info.duration) * 100)));
          }
        : null,
    });
  } finally {
    await fs.unlink(pngPath).catch(() => {});
  }

  return { duration: info.duration, width: info.width, height: info.height, rotation: info.rotation };
}

module.exports = { renderVideoQuote, probeVideo, normalizeRotation };
