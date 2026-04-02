const {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const prism = require('prism-media');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { uploadToDrive } = require('./googleDrive');

const SILENCE_TIMEOUT_MS = 10 * 60 * 1000; // 10 นาที
const TMP_DIR = path.join(__dirname, '../tmp');

// เก็บ session ที่กำลัง record อยู่ key = guildId
const activeSessions = new Map();

/**
 * เริ่ม record voice channel
 * @param {VoiceChannel} voiceChannel
 * @param {TextChannel} textChannel - สำหรับส่ง link หลัง stop
 * @returns {{ success: boolean, error?: string }}
 */
async function startRecording(voiceChannel, textChannel) {
  const guildId = voiceChannel.guild.id;

  if (activeSessions.has(guildId)) {
    throw new Error('มี session ที่กำลัง record อยู่แล้วครับ');
  }

  // สร้าง tmp dir ถ้ายังไม่มี
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
    debug: true,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[voiceRecorder] state: ${oldState.status} → ${newState.status}`);
    // ดัก close code จาก networking layer
    const networking = Reflect.get(newState, 'networking') ?? Reflect.get(oldState, 'networking');
    if (networking) {
      networking.once('close', (code) => console.log('[voice close code]', code));
    }
  });
  connection.on('debug', (msg) => console.log('[voice debug]', msg));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    console.error('[voiceRecorder] entersState error:', err);
    connection.destroy();
    throw new Error('เชื่อมต่อ voice channel ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง');
  }

  const receiver = connection.receiver;
  const pcmStreams = new Map(); // userId → PCM write stream
  const pcmFiles   = [];       // path ของ PCM ไฟล์แต่ละคน

  let silenceTimer = null;
  let stopped = false;

  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (!stopped) {
        stopRecording(guildId, textChannel, '⏹ หยุดบันทึกอัตโนมัติ (ไม่มีเสียงนาน 10 นาที)');
      }
    }, SILENCE_TIMEOUT_MS);
  };

  // เริ่ม silence timer ทันที
  resetSilenceTimer();

  // รับ audio stream จากแต่ละ user
  receiver.speaking.on('start', (userId) => {
    if (pcmStreams.has(userId)) return;

    resetSilenceTimer();

    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 100 },
    });

    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    const pcmPath = path.join(TMP_DIR, `${guildId}_${userId}_${Date.now()}.pcm`);
    const writeStream = fs.createWriteStream(pcmPath);

    opusStream.pipe(decoder).pipe(writeStream);
    pcmFiles.push(pcmPath);
    pcmStreams.set(userId, writeStream);

    opusStream.on('end', () => {
      pcmStreams.delete(userId);
      resetSilenceTimer();
    });
  });

  const session = {
    connection,
    pcmFiles,
    textChannel,
    voiceChannel,
    silenceTimer,
    stopFn: null,
  };

  // expose stopFn ให้ stopRecording ใช้
  session.stopFn = (reason) => _finalize(session, guildId, reason);
  activeSessions.set(guildId, session);
}

/**
 * หยุด record และ process ไฟล์
 */
async function stopRecording(guildId, textChannel, reason = '⏹ หยุดบันทึกแล้วครับ') {
  const session = activeSessions.get(guildId);
  if (!session) return { success: false, error: 'ไม่มี session ที่กำลัง record อยู่' };

  activeSessions.delete(guildId);
  await session.stopFn(reason);
  return { success: true };
}

/**
 * ตรวจสอบว่า guild กำลัง record อยู่ไหม
 */
function isRecording(guildId) {
  return activeSessions.has(guildId);
}

// ────────────────────────────────────────────────
// Internal
// ────────────────────────────────────────────────

async function _finalize(session, guildId, reason) {
  const { connection, pcmFiles, textChannel, voiceChannel, silenceTimer } = session;

  if (silenceTimer) clearTimeout(silenceTimer);

  // ออกจาก voice channel
  connection.destroy();

  await textChannel.send({ content: `${reason}\n⏳ กำลัง mix และ upload ไฟล์ กรุณารอสักครู่...` });

  if (pcmFiles.length === 0) {
    await textChannel.send({ content: '⚠️ ไม่มีเสียงที่บันทึกได้เลยครับ' });
    return;
  }

  const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const mp3Path  = path.join(TMP_DIR, `${guildId}_${ts}.mp3`);
  const fileName = `${voiceChannel.name}_${ts}.mp3`.replace(/\s+/g, '_');

  try {
    await mixAndEncode(pcmFiles, mp3Path);
    const link = await uploadToDrive(mp3Path, fileName);

    await textChannel.send({
      content: [
        `🎙 บันทึกเสียงเรียบร้อยแล้วครับ`,
        `📁 **${fileName}**`,
        `🔗 ${link}`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[voiceRecorder] finalize error:', err);
    await textChannel.send({ content: `❌ เกิดข้อผิดพลาดระหว่าง process ไฟล์: ${err.message}` });
  } finally {
    // ลบ tmp files
    for (const f of [...pcmFiles, mp3Path]) {
      fs.rm(f, { force: true }, () => {});
    }
  }
}

/**
 * Mix PCM files จากหลาย user แล้ว encode เป็น MP3
 */
function mixAndEncode(pcmFiles, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    for (const f of pcmFiles) {
      cmd.input(f).inputOptions([
        '-f', 's16le',   // signed 16-bit little-endian PCM
        '-ar', '48000',  // sample rate
        '-ac', '2',      // stereo
      ]);
    }

    if (pcmFiles.length > 1) {
      cmd.complexFilter([`amix=inputs=${pcmFiles.length}:duration=longest`]);
    }

    cmd
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

module.exports = { startRecording, stopRecording, isRecording };
