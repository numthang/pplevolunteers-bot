// utils/generateOrgChart.js
// สร้างรูปภาพ org chart ด้วย @napi-rs/canvas

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const W         = 720;
const PADDING   = 24;
const TOP_H     = 80;
const CARD_H    = 68;
const CARD_GAP  = 10;
const AVATAR_R  = 20; // radius ของ avatar circle

const RANK_COLORS = ['#F5A623', '#C0C0C0', '#CD7F32'];
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function rankColor(i) {
  return RANK_COLORS[i] ?? '#4A5568';
}

function today() {
  return new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function fmtVoice(seconds) {
  if (!seconds) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function fmtReplyRate(rate) {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 100)}%`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * @param {string} roleName
 * @param {string|null} roleHex  เช่น '#3498db'
 * @param {Array} members  [{ displayName, avatarURL, messages, voiceSeconds, score, replyRate, lastActive }]
 * @returns {Buffer} PNG buffer
 */
async function generateOrgChart(roleName, roleHex, members) {
  const canvasH = TOP_H + members.length * (CARD_H + CARD_GAP) + PADDING;
  const canvas  = createCanvas(W, canvasH);
  const ctx     = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(0, 0, W, canvasH);

  // top accent bar ใช้สีของ role
  ctx.fillStyle = roleHex ?? '#5865F2';
  ctx.fillRect(0, 0, W, 4);

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.font      = 'bold 22px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`📊  ${roleName}`, PADDING, 36);

  ctx.font      = '13px sans-serif';
  ctx.fillStyle = '#718096';
  ctx.fillText(`Top ${members.length} Active  •  ${today()}`, PADDING, 58);

  // ── Cards ───────────────────────────────────────────────────────────────────
  const maxScore = members[0]?.score || 1;

  for (let i = 0; i < members.length; i++) {
    const m    = members[i];
    const rank = i + 1;
    const cx   = PADDING;
    const cy   = TOP_H + i * (CARD_H + CARD_GAP);
    const cw   = W - PADDING * 2;
    const color = rankColor(i);

    // card bg
    roundRect(ctx, cx, cy, cw, CARD_H, 10);
    ctx.fillStyle = '#1a1d27';
    ctx.fill();

    // left accent
    ctx.fillStyle = color;
    ctx.fillRect(cx, cy + 10, 3, CARD_H - 20);

    // rank badge
    ctx.font      = rank <= 3 ? 'bold 18px sans-serif' : 'bold 14px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(rank <= 3 ? RANK_MEDALS[i] : `#${rank}`, cx + 26, cy + CARD_H / 2 + 6);
    ctx.textAlign = 'left';

    // avatar
    const ax = cx + 50;
    const ay = cy + CARD_H / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, AVATAR_R, 0, Math.PI * 2);
    ctx.clip();
    try {
      const img = await loadImage(m.avatarURL);
      ctx.drawImage(img, ax - AVATAR_R, ay - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
    } catch {
      ctx.fillStyle = color + '55';
      ctx.fillRect(ax - AVATAR_R, ay - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
      ctx.fillStyle = '#fff';
      ctx.font      = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((m.displayName[0] ?? '?').toUpperCase(), ax, ay + 5);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // avatar ring
    ctx.beginPath();
    ctx.arc(ax, ay, AVATAR_R + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = color + '99';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // name
    const nx = ax + AVATAR_R + 12;
    ctx.font      = 'bold 14px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(m.displayName, nx, cy + 24);

    // stats row
    ctx.font      = '12px sans-serif';
    ctx.fillStyle = '#A0AEC0';
    const stats = [
      `💬 ${m.messages}`,
      `🔊 ${fmtVoice(m.voiceSeconds)}`,
      `↩️ ${fmtReplyRate(m.replyRate)}`,
    ].join('    ');
    ctx.fillText(stats, nx, cy + 44);

    // score bar
    const barX  = W - PADDING - 130;
    const barY  = cy + CARD_H / 2 - 3;
    const barW  = 100;
    const barH  = 6;
    const fillW = Math.max(4, Math.round((m.score / maxScore) * barW));

    roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fillStyle = '#2D3748';
    ctx.fill();

    roundRect(ctx, barX, barY, fillW, barH, 3);
    const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#F6E05E');
    ctx.fillStyle = grad;
    ctx.fill();

    // score label
    ctx.font      = 'bold 12px sans-serif';
    ctx.fillStyle = '#F6E05E';
    ctx.textAlign = 'right';
    ctx.fillText(`${m.score.toLocaleString()} pts`, W - PADDING, cy + CARD_H / 2 + 5);
    ctx.textAlign = 'left';
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateOrgChart };
