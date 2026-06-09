// รันครั้งเดียว: node scripts/auth-drive.js
// เพื่อรับ token และเก็บไว้ที่ ~/.secrets/drive-token.json
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN || path.join(os.homedir(), '.secrets/drive-token.json');
const { client_id, client_secret, redirect_uris } = JSON.parse(fs.readFileSync(process.env.GOOGLE_OAUTH_KEY)).installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3737');

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive.file'],
  prompt: 'consent',
});

console.log('เปิด URL นี้ใน browser:\n', authUrl, '\n');

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, 'http://localhost:3737').searchParams.get('code');
  if (!code) { res.end('ไม่พบ code'); return; }

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('✅ บันทึก token ที่', TOKEN_PATH);
  res.end('<h2>✅ สำเร็จ! ปิดหน้าต่างนี้ได้เลย</h2>');
  server.close();
}).listen(3737);

console.log('รอรับ callback ที่ http://localhost:3737 ...');
