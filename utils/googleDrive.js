const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN || path.join(require('os').homedir(), '.secrets/drive-token.json');
const CREDENTIALS_PATH = process.env.GOOGLE_OAUTH_KEY;

function getAuthClient() {
  const { client_id, client_secret, redirect_uris } = JSON.parse(fs.readFileSync(CREDENTIALS_PATH)).installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);
  oAuth2Client.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) token.refresh_token = newTokens.refresh_token;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...token, ...newTokens }));
  });
  return oAuth2Client;
}

const drive = google.drive({ version: 'v3', auth: getAuthClient() });

/**
 * Upload ไฟล์ไปยัง Google Drive folder ที่กำหนด
 * @param {string} filePath - path ของไฟล์บน server
 * @param {string} fileName - ชื่อไฟล์ที่จะแสดงใน Drive
 * @returns {string} - shareable link
 */
async function uploadToDrive(filePath, fileName) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // Upload ไฟล์
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'audio/mpeg',
      body: fs.createReadStream(filePath),
    },
    fields: 'id',
  });

  const fileId = res.data.id;

  // ตั้ง permission: anyone with link can view
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://drive.google.com/file/d/${fileId}/view`;
}

module.exports = { uploadToDrive };
