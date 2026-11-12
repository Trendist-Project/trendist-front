// 슬라이드에서 쓰는 그리기 도우미(게임의 거북이·스킬 연출 코드를 그대로 쓴다: game.bundle.js)
const G = window.Game;
const TW = 'node_modules/@twemoji/svg/';
const EMO = { '✨': '2728', '🕶️': '1f576', '🕶': '1f576', '☠️': '2620', '☠': '2620', '🛡': '1f6e1', '⚡': '26a1', '🪝': '1fa9d', '💥': '1f4a5', '👻': '1f47b', '🔥': '1f525', '❤': '2764', '❤️': '2764', '➕': '2795', '💀': '1f480' };
const emoImgs = {};
for (const [k, cp] of Object.entries(EMO)) { const im = new Image(); im.src = TW + cp + '.svg'; emoImgs[k] = im; }
// 캔버스 글자로 그리는 이모지(✨·🕶️)는 이 환경에 이모지 글꼴이 없어 트위모지 그림으로 대신 그린다
const _fill = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (text, x, y, mw) {
  const im = emoImgs[text];
  if (im && im.complete) {
    const size = parseFloat((this.font.match(/(\d+(?:\.\d+)?)px/) || [0, 24])[1]);
    const a = this.textAlign, b = this.textBaseline;
    const dx = a === 'center' ? -size / 2 : a === 'right' ? -size : 0, dy = b === 'bottom' ? -size : b === 'middle' ? -size / 2 : -size * 0.85;
    this.drawImage(im, x + dx, y + dy, size, size); return;
  }
  return _fill.call(this, text, x, y, mw);
};
const arenaBg = (ctx, w, h, grid = 60, dark = false) => {
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#26395a'); g.addColorStop(1, '#1c2c47');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1.5;
  for (let x = 0; x <= w; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
};
const RAINBOW = ['#ff5f6d', '#ffc371', '#f9f871', '#7be495', '#4dd0e1', '#7c8cff', '#c77dff'];
/** 게임 아이콘과 같은 순서: 바탕 원 → 거북이 → 테두리. bg는 색 문자열 또는 'rainbow'. alpha는 바탕 진하기 0~1 */
function orb(ctx, x, y, r, o = {}) {
  const { bg = G.TURTLE_BASE, level = 1, alpha = 1, border = '#11372a', lw, me = false, name = '', nameSize, angle = 0, glow = null } = o;
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = r * 0.6; }
  if (bg === 'rainbow') { const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c)); ctx.fillStyle = g; }
  else ctx.fillStyle = bg;
  ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
  G.drawTurtle(ctx, x, y, r, level, angle);
  ctx.save(); ctx.strokeStyle = border; ctx.lineWidth = lw ?? Math.max(2.5, r * 0.07);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  if (me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, r * 0.06); ctx.beginPath(); ctx.arc(x, y, r + Math.max(6, r * 0.1), 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  if (name) {
    const fs = nameSize ?? Math.max(16, r * 0.28);
    ctx.save(); ctx.font = `900 ${fs}px "Noto Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = fs * 0.28; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round';
    const ny = y + r + 10 + (me ? Math.max(6, r * 0.1) : 0); ctx.strokeText(name, x, ny); ctx.fillStyle = '#fff'; ctx.fillText(name, x, ny); ctx.restore();
  }
}
/** 스킬 연출 한 장면: 게임의 SkillFxLayer로 time(ms) 순간을 그린다. actors: {1: {x,y,r,...orb옵션}, 2: ...} */
function fxScene(canvas, { w = 480, h = 320, actors, events, at, drawOrbs = true, extra }) {
  const dpr = 2; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  arenaBg(ctx, w, h, 48);
  const fx = new G.SkillFxLayer(false);
  for (const [t, ev] of events) if (t <= at) fx.show(ev, t);
  const pos = (e) => (actors[e] ? { x: actors[e].x, y: actors[e].y, r: actors[e].r } : null);
  // 은신은 진행도로 투명하게 그린다
  if (drawOrbs) for (const k of Object.keys(actors)) {
    const a = actors[k];
    const sp = fx.stealthProgress(Number(k), at);
    ctx.save(); ctx.globalAlpha = a.alpha ?? (1 - 0.6 * sp);
    orb(ctx, a.x, a.y, a.r, a); ctx.restore();
  }
  if (extra) extra(ctx, fx, at);
  fx.drawActive(ctx, at, 1, pos);
  return { ctx, fx };
}
window.L = { orb, arenaBg, fxScene, RAINBOW, G };
