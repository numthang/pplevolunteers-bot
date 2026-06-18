// services/fetchMessages.js
// ดึงข้อความจาก Discord channel/thread — ใช้ร่วมกันทั้ง /message fetch และ context menu

// ดึงทุกข้อความใน channel/thread (loop ทีละ 100 จนหมด)
async function fetchAllMessages(channel) {
  const result = [];
  let lastId   = null;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      result.push(serializeMessage(msg, channel));
    }

    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  return result;
}

function serializeMessage(msg, channel) {
  // ข้อความ forward — เนื้อหาจริงอยู่ใน snapshot ไม่ใช่ msg.content
  let content     = msg.content;
  let attachments = msg.attachments;
  let isForwarded = false;
  if (!msg.content && msg.flags?.has('HasSnapshot')) {
    const snap = msg.messageSnapshots?.[0] ?? msg.messageSnapshots?.first?.();
    if (snap) {
      content     = snap.content ?? '';
      attachments = snap.attachments ?? msg.attachments;
      isForwarded = true;
    }
  }

  return {
    channel_id:   channel.id,
    channel_name: channel.name,
    message_id:   msg.id,
    timestamp:    msg.createdAt.toISOString(),
    author_id:    msg.author.id,
    author_tag:   msg.author.tag,
    forwarded:    isForwarded,
    content,
    attachments:  attachments.map(a => ({ filename: a.name, url: a.url })),
    embeds:       msg.embeds.map(e => ({
      title:       e.title ?? null,
      description: e.description ?? null,
      fields:      e.fields.map(f => ({ name: f.name, value: f.value })),
    })),
    reactions:    msg.reactions.cache.map(r => ({ emoji: r.emoji.name, count: r.count })),
  };
}

// แปลง messages → plain text สำหรับส่งให้ AI (เรียงเก่า→ใหม่)
function messagesToPlainText(messages) {
  return messages
    .filter(m => m.content || m.embeds.some(e => e.title || e.description || e.fields.length))
    .map(m => {
      const parts = [`[${m.timestamp.slice(0, 16)}] ${m.author_tag}:`];
      if (m.content) parts.push(m.content);
      for (const e of m.embeds) {
        if (e.title) parts.push(`[Embed] ${e.title}`);
        if (e.description) parts.push(e.description);
        for (const f of e.fields) parts.push(`${f.name}: ${f.value}`);
      }
      return parts.join(' ');
    })
    .join('\n');
}

// สร้างไฟล์ raw สำหรับ download (txt/csv/json)
function buildFile(messages, format) {
  const ts           = new Date().toISOString().slice(0, 10);
  const channelNames = [...new Set(messages.map(m => m.channel_name))]
    .map(name => String(name).replace(/\s+/g, '_'))
    .join('_');
  const baseName = `${channelNames}_${ts}`;

  if (format === 'json') {
    return {
      buffer:   Buffer.from(JSON.stringify(messages, null, 2), 'utf8'),
      filename: `${baseName}.json`,
    };
  }

  if (format === 'csv') {
    const headers = ['channel_id','channel_name','message_id','timestamp','author_id','author_tag','forwarded','content','attachments','embeds','reactions'];
    const rows = messages.map(m => [
      m.channel_id, m.channel_name, m.message_id, m.timestamp,
      m.author_id, m.author_tag, m.forwarded,
      csvEscape(m.content),
      csvEscape(JSON.stringify(m.attachments)),
      csvEscape(JSON.stringify(m.embeds)),
      csvEscape(JSON.stringify(m.reactions)),
    ].join(','));
    return {
      buffer:   Buffer.from('\uFEFF' + [headers.join(','), ...rows].join('\n'), 'utf8'),
      filename: `${baseName}.csv`,
    };
  }

  // TXT
  const lines = messages.map(m => {
    const embedLines = m.embeds.flatMap(e => {
      const parts = [];
      if (e.title) parts.push(`[Embed] ${e.title}`);
      if (e.description) parts.push(e.description);
      for (const f of e.fields) parts.push(`${f.name}: ${f.value}`);
      return parts;
    });
    const body = [m.content, ...embedLines].filter(Boolean).join('\n') || '(no text content)';
    return `[${m.timestamp}] ${m.author_tag} (${m.channel_name})${m.forwarded ? ' ↪️forwarded' : ''}\n${body}` +
      (m.attachments.length ? `\nAttachments: ${m.attachments.map(a => a.url).join(', ')}` : '') +
      '\n' + '─'.repeat(60);
  });
  return {
    buffer:   Buffer.from('﻿' + lines.join('\n'), 'utf8'),
    filename: `${baseName}.txt`,
  };
}

function csvEscape(str) {
  if (!str && str !== false) return '';
  return `"${String(str).replace(/"/g, '""')}"`;
}

module.exports = { fetchAllMessages, serializeMessage, messagesToPlainText, buildFile };
