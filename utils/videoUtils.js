const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const os   = require('os');

async function probeVideoCodec(filePath) {
  return new Promise(resolve => {
    exec(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
      (err, stdout) => resolve(err ? '' : stdout.trim().toLowerCase())
    );
  });
}

async function convertToMp4(inputBuffer) {
  const tmpIn  = path.join(os.tmpdir(), `${crypto.randomBytes(8).toString('hex')}.mov`);
  const tmpOut = path.join(os.tmpdir(), `${crypto.randomBytes(8).toString('hex')}.mp4`);
  try {
    fs.writeFileSync(tmpIn, inputBuffer);
    const codec  = await probeVideoCodec(tmpIn);
    const vCodec = codec === 'h264' ? 'copy' : 'libx264 -crf 23 -preset fast';
    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -i "${tmpIn}" -codec:v ${vCodec} -codec:a aac -movflags +faststart -y "${tmpOut}"`,
        (err, _stdout, stderr) => err ? reject(new Error(stderr.slice(-400))) : resolve()
      );
    });
    return fs.readFileSync(tmpOut);
  } finally {
    fs.unlink(tmpIn, () => {});
    fs.unlink(tmpOut, () => {});
  }
}

// เรียกจาก platform functions — แปลงเฉพาะ .mov, ไฟล์อื่นคืน buffer เดิม
async function convertVideoIfNeeded(buffer, sourceUrl, onProgress = null) {
  if (!/\.mov($|\?)/i.test(sourceUrl)) return buffer;
  if (onProgress) onProgress('⏳ กำลังแปลงวิดีโอเป็น MP4...');
  return convertToMp4(buffer);
}

module.exports = { convertVideoIfNeeded };
