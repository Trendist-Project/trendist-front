import { Trails } from './trails';
import { borderLineWidth, drawTurtle, TURTLE_BASE } from './turtle';

/** 공유 카드(4.24)에 넣는 값. 모두 지금 있는 API에서 모은다 */
export interface ShareCardData {
  nickname: string;
  level: number;
  title: string | null;
  score: number;
  rank: number | null; // 리더보드 TOP 10 안이면 순위
  scores: number[]; // 최근 7일 유행도(그래프)
  keywords: string[]; // 가진 🔥 키워드(트렌드 값 높은 순, 최대 3개)
  records: [string, string][]; // [이름, 값] 4개
  look: { background: string; borderColor: string | null; borderWidth: number | null };
  trail: string | null;
  url: string; // 카드 아래 주소(https:// 없이)
}

export const CARD_W = 1080, CARD_H = 1350; // 인스타 피드 4:5
const FONT = '"Noto Sans KR", system-ui, -apple-system, sans-serif';
const ACCENT = '#3fb68b';
const TEXT = '#e8eef6';
const MUTED = '#8b9bb0';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 너비를 넘으면 뒤를 …로 줄인다 */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > max) chars.pop();
  return chars.join('') + '…';
}

/** 원이 왼쪽 아래에서 곡선으로 올라와 멈춘 모습. 아레나와 같은 효과 코드를 몇 프레임 돌려 자국을 남긴다 */
function drawCircleWithTrail(ctx: CanvasRenderingContext2D, d: ShareCardData, cx: number, cy: number, r: number) {
  let heading = 0.6;
  if (d.trail) {
    const trails = new Trails();
    const scratch = document.createElement('canvas').getContext('2d')!;
    const frames = 70, start = 1000;
    const pos = (t: number) => ({ x: cx - 330 * (1 - t) - 40 * Math.sin(t * Math.PI), y: cy + 120 * (1 - t) * (1 - t) });
    for (let i = 0; i <= frames; i++) {
      const t = i / frames, p = pos(t), now = start + i * 16;
      trails.update(1, d.trail, p.x, p.y, r, now, d.look.background);
      trails.draw(i === frames ? ctx : scratch, now, 0.016);
    }
    const a = pos(0.97), b = pos(1);
    heading = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  }
  // 원 + 은은한 빛
  ctx.save();
  ctx.shadowColor = 'rgba(63,182,139,0.45)';
  ctx.shadowBlur = 60;
  ctx.fillStyle = d.look.background || TURTLE_BASE;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawTurtle(ctx, cx, cy, r, d.level, heading);
  ctx.strokeStyle = d.look.borderColor ?? '#11372a';
  ctx.lineWidth = borderLineWidth(r, d.look.borderWidth);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

function drawSparkline(ctx: CanvasRenderingContext2D, values: number[], x: number, y: number, w: number, h: number) {
  if (values.length < 2) return;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const px = (i: number) => x + (w * i) / (values.length - 1);
  const py = (v: number) => y + h - ((v - min) / span) * h * 0.85 - h * 0.075;
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
  const line = new Path2D();
  values.forEach((v, i) => (i === 0 ? line.moveTo(px(i), py(v)) : line.lineTo(px(i), py(v))));
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(63,182,139,0.35)'); g.addColorStop(1, 'rgba(63,182,139,0)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(line);
  const last = values[values.length - 1];
  ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.arc(px(values.length - 1), py(last), 9, 0, Math.PI * 2); ctx.fill();
}

/** 1080×1350 카드를 그린다. 글꼴과 로고를 기다린 뒤 그리므로 비동기다 */
export async function drawShareCard(canvas: HTMLCanvasElement, d: ShareCardData) {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.ready;
  const logo = await loadImage('/logo.png');
  const W = CARD_W;

  // 바탕: 어두운 그라데이션 + 떠다니는 원(메인 화면 느낌)
  const bg = ctx.createLinearGradient(0, 0, W, CARD_H);
  bg.addColorStop(0, '#0d1420'); bg.addColorStop(1, '#122433');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, CARD_H);
  for (const [x, y, r, a] of [[90, 260, 120, 0.08], [990, 180, 90, 0.07], [960, 760, 160, 0.06], [120, 980, 80, 0.07], [880, 1180, 60, 0.08]]) {
    ctx.fillStyle = `rgba(63,182,139,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const glow = ctx.createRadialGradient(W / 2, 345, 40, W / 2, 345, 420);
  glow.addColorStop(0, 'rgba(63,182,139,0.18)'); glow.addColorStop(1, 'rgba(63,182,139,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 900);

  ctx.textBaseline = 'middle';
  // 머리: 로고 + 이름
  if (logo) ctx.drawImage(logo, 64, 52, 76, 76);
  ctx.fillStyle = TEXT; ctx.font = `800 44px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText('Trendist', logo ? 156 : 64, 92);
  ctx.fillStyle = MUTED; ctx.font = `500 28px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText('내 트렌드 성적표', W - 64, 92);

  // 원과 이동 효과
  drawCircleWithTrail(ctx, d, W / 2, 345, 140);

  // 닉네임·칭호·레벨
  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT; ctx.font = `800 68px ${FONT}`;
  ctx.fillText(fit(ctx, d.nickname, W - 160), W / 2, 570);
  ctx.font = `600 30px ${FONT}`;
  const sub = `${d.title ? `「${d.title}」  ` : ''}Lv.${d.level}`;
  const sw = ctx.measureText(sub).width + 48;
  roundRect(ctx, (W - sw) / 2, 616, sw, 52, 26);
  ctx.fillStyle = 'rgba(63,182,139,0.14)'; ctx.fill();
  ctx.strokeStyle = 'rgba(63,182,139,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#9fe0c3'; ctx.fillText(sub, W / 2, 643);

  // 큰 숫자: 유행도 | 순위
  const boxY = 700, boxH = 240;
  roundRect(ctx, 64, boxY, W - 128, boxH, 28);
  ctx.fillStyle = 'rgba(20,27,38,0.85)'; ctx.fill();
  ctx.strokeStyle = '#263243'; ctx.lineWidth = 2; ctx.stroke();
  const half = (W - 128) / 2;
  ctx.fillStyle = MUTED; ctx.font = `600 28px ${FONT}`;
  ctx.fillText('현재 유행도', 64 + half / 2, boxY + 48);
  ctx.fillText(d.rank ? '지금 순위' : '최근 7일', 64 + half * 1.5, boxY + 48);
  ctx.fillStyle = TEXT; ctx.font = `800 84px ${FONT}`;
  ctx.fillText(d.score.toLocaleString(), 64 + half / 2, boxY + 128);
  if (d.rank) {
    ctx.fillStyle = d.rank <= 3 ? '#ffd27a' : TEXT;
    ctx.fillText(`${d.rank}위`, 64 + half * 1.5, boxY + 128);
    ctx.fillStyle = MUTED; ctx.font = `500 24px ${FONT}`;
    ctx.fillText('🏆 리더보드 TOP 10', 64 + half * 1.5, boxY + 190);
  }
  // 그래프: 순위가 있으면 아래 전체 폭, 없으면 오른쪽 칸
  if (d.rank) drawSparkline(ctx, d.scores, 64 + 60, boxY + 176, half - 120, 40);
  else drawSparkline(ctx, d.scores, 64 + half + 40, boxY + 86, half - 80, 120);
  ctx.strokeStyle = '#263243'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64 + half, boxY + 30); ctx.lineTo(64 + half, boxY + boxH - 30); ctx.stroke();

  // 가진 🔥 키워드
  let y = 985;
  if (d.keywords.length) {
    ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = `600 26px ${FONT}`;
    ctx.fillText('🔥 지금 가진 키워드', 64, y);
    y += 52;
    ctx.font = `700 30px ${FONT}`;
    let x = 64;
    const maxEach = (W - 128 - 16 * (d.keywords.length - 1)) / d.keywords.length;
    for (const k of d.keywords) {
      const label = fit(ctx, `#${k}`, maxEach - 44);
      const w = ctx.measureText(label).width + 44;
      roundRect(ctx, x, y - 30, w, 60, 30);
      ctx.fillStyle = 'rgba(255,140,80,0.12)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,80,0.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffb48a'; ctx.fillText(label, x + 22, y + 1);
      x += w + 16;
    }
    y += 56;
  } else {
    y += 30;
  }

  // 누적 기록 4칸
  const cols = d.records.length, gap = 16, cw = (W - 128 - gap * (cols - 1)) / cols;
  d.records.forEach(([name, value], i) => {
    const x = 64 + i * (cw + gap);
    roundRect(ctx, x, y, cw, 104, 20);
    ctx.fillStyle = 'rgba(20,27,38,0.85)'; ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT; ctx.font = `800 40px ${FONT}`;
    ctx.fillText(value, x + cw / 2, y + 42);
    ctx.fillStyle = MUTED; ctx.font = `500 22px ${FONT}`;
    ctx.fillText(name, x + cw / 2, y + 80);
  });

  // 바닥: 한 줄 홍보 + 주소
  ctx.textAlign = 'center';
  ctx.fillStyle = ACCENT; ctx.font = `800 34px ${FONT}`;
  ctx.fillText('유행을 아는 자, 커진다.', W / 2, CARD_H - 96);
  ctx.fillStyle = MUTED; ctx.font = `500 26px ${FONT}`;
  ctx.fillText(`${d.url} 에서 나랑 겨뤄 봐!`, W / 2, CARD_H - 50);
}
