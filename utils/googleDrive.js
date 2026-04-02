const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// โหลด Service Account credentials จาก env
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY, // path to .json credentials
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

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
