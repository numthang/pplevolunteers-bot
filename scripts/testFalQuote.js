// scripts/testFalQuote.js
// Usage: node scripts/testFalQuote.js <image-path>
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { fal } = require('@fal-ai/client');

const key = process.env.FAL_API_KEY;
if (!key) { console.error('❌ FAL_API_KEY ไม่พบใน .env'); process.exit(1); }
fal.config({ credentials: key });

const imgPath = process.argv[2];
if (!imgPath || !fs.existsSync(imgPath)) {
  console.error('Usage: node scripts/testFalQuote.js <image-path>');
  process.exit(1);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  // 1. Upload รูปไป fal storage เพื่อได้ URL
  console.log('📤 Uploading image to fal.ai storage...');
  const buf  = fs.readFileSync(imgPath);
  const ext  = path.extname(imgPath).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const blob = new Blob([buf], { type: `image/${ext}` });
  const imageUrl = await fal.storage.upload(blob);
  console.log('   ✅ image_url:', imageUrl);

  // 2. Run fal-ai/flux-general (img2img)
  console.log('\n🤖 Running fal-ai/flux-general...');
  const result = await fal.subscribe('fal-ai/flux-general', {
    input: {
      prompt:
        'Add a bold white quote text overlay on a semi-transparent dark navy rounded panel ' +
        'placed in the empty area of the image. Orange accent color #ff6a13. ' +
        'Professional political campaign poster style. Keep the original photo intact.',
      image_url:            imageUrl,
      strength:             0.35,
      num_inference_steps:  28,
      guidance_scale:       3.5,
      num_images:           1,
      output_format:        'jpeg',
      enable_safety_checker: false,
    },
    logs: true,
    onQueueUpdate: update => {
      if (update.status === 'IN_PROGRESS') {
        update.logs?.forEach(l => console.log('  ', l.message));
      }
    },
  });

  console.log('\n📊 result.data keys:', Object.keys(result.data || {}));
  console.log(JSON.stringify(result.data, null, 2));

  // 3. Download ผลลัพธ์
  const images = result.data?.images;
  if (images?.length) {
    const outPath = imgPath.replace(/\.[^.]+$/, '') + '_fal_out.jpg';
    await download(images[0].url, outPath);
    console.log(`\n✅ บันทึกที่: ${outPath}`);
    console.log('   size:', images[0].width, 'x', images[0].height);
  } else {
    console.log('\n⚠️  ไม่พบ images ใน response — ดู result.data ด้านบน');
  }
})().catch(err => {
  console.error('\n❌', err.message);
  if (err.body) console.error('body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
});
