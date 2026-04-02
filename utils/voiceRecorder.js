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
// 48000 samples/sec * 2 channels * 2 bytes = 192000 bytes/sec
const BYTES_PER_MS = 192000 / 1000;

const activeSessions = new Map();

async function startRecording(voiceChannel, textChannel) {
  const guildId = voiceChannel.guild.id;

  if (activeSessions.has(guildId)) {
    throw new Error('มี session ที่กำลัง record อยู่แล้วครับ');
  }

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    console.error('[voiceRecorder] entersState error:', err);
    connection.destroy();
    throw new Error('เชื่อมต่อ voice channel ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง');
  }

  const receiver = connection.receiver;
  const sessionStartTime = Date.now();

  // userId → { writeStream, pcmPath, lastEndTime }
  const userStreams = new Map();
  const pcmPaths = [];

  let silenceTimer = null;
  let stopped = false;

  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (!stopped) stopRecording(guildId, textChannel, '⏹ หยุดบันทึกอัตโนมัติ (ไม่มีเสียงนาน 10 นาที)');
    }, SILENCE_TIMEOUT_MS);
  };

  resetSilenceTimer();

  receiver.speaking.on('start', (userId) => {
    resetSilenceTimer();

    const now = Date.now();

    if (!userStreams.has(userId)) {
      // user พูดครั้งแรก — เปิดไฟล์ใหม่ พร้อม pad silence จาก session start
      const pcmPath = path.join(TMP_DIR, `${guildId}_${userId}.pcm`);
      const writeStream = fs.createWriteStream(pcmPath);
      const silenceMs = now - sessionStartTime;
      if (silenceMs > 0) writeStream.write(Buffer.alloc(Math.floor(silenceMs * BYTES_PER_MS)));
      pcmPaths.push(pcmPath);
      userStreams.set(userId, { writeStream, lastEndTime: null });
    } else {
      // user พูดซ้ำ — pad silence ช่วงที่หยุดพูด
      const { writeStream, lastEndTime } = userStreams.get(userId);
      if (lastEndTime) {
        const silenceMs = now - lastEndTime;
        if (silenceMs > 0) writeStream.write(Buffer.alloc(Math.floor(silenceMs * BYTES_PER_MS)));
      }
    }

    const { writeStream } = userStreams.get(userId);
    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 100 },
    });
    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

    // pipe เข้า writeStream เดิม โดยไม่ปิด writeStream เมื่อ decoder จบ
    opusStream.pipe(decoder).pipe(writeStream, { end: false });

    opusStream.on('end', () => {
      decoder.unpipe(writeStream);
      decoder.destroy();
      userStreams.get(userId).lastEndTime = Date.now();
      resetSilenceTimer();
    });
  });

  const session = {
    connection,
    userStreams,
    pcmPaths,
    textChannel,
    voiceChannel,
    get silenceTimer() { return silenceTimer; },
    stopFn: null,
    stopped,
  };

  session.stopFn = (reason) => {
    stopped = true;
    if (silenceTimer) clearTimeout(silenceTimer);
    return _finalize(session, reason);
  };
  activeSessions.set(guildId, session);
}

async function stopRecording(guildId, textChannel, reason = '⏹ หยุดบันทึกแล้วครับ') {
  const session = activeSessions.get(guildId);
  if (!session) return { success: false, error: 'ไม่มี session ที่กำลัง record อยู่' };

  activeSessions.delete(guildId);
  await session.stopFn(reason);
  return { success: true };
}

function isRecording(guildId) {
  return activeSessions.has(guildId);
}

// ────────────────────────────────────────────────

async function _finalize(session, reason) {
  const { connection, userStreams, pcmPaths, textChannel, voiceChannel } = session;

  connection.destroy();

  // ปิด write stream ทุก user แล้วรอให้ flush เสร็จ
  await Promise.all(
    [...userStreams.values()].map(({ writeStream }) =>
      new Promise((resolve) => writeStream.end(resolve))
    )
  );

  await textChannel.send({ content: `${reason}\n⏳ กำลัง mix และ upload ไฟล์ กรุณารอสักครู่...` });

  if (pcmPaths.length === 0) {
    await textChannel.send({ content: '⚠️ ไม่มีเสียงที่บันทึกได้เลยครับ' });
    return;
  }

  const ts      = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const mp3Path = path.join(TMP_DIR, `${session.voiceChannel.guild.id}_${ts}.mp3`);
  const fileName = `${voiceChannel.name}_${ts}.mp3`.replace(/\s+/g, '_');

  try {
    await mixAndEncode(pcmPaths, mp3Path);
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
    for (const f of [...pcmPaths, mp3Path]) {
      fs.rm(f, { force: true }, () => {});
    }
  }
}

function mixAndEncode(pcmFiles, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    for (const f of pcmFiles) {
      cmd.input(f).inputOptions([
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
      ]);
    }

    if (pcmFiles.length > 1) {
      cmd.complexFilter([`amix=inputs=${pcmFiles.length}:duration=longest:normalize=0,dynaudnorm`]);
    } else {
      cmd.audioFilters('dynaudnorm');
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
