/**
 * 원 꾸미기 그리기(4.9, 4.25, 4.26): 테두리 효과, 이름표, 콤보 불꽃, 이모트.
 * 아레나·꾸미기 미리 보기가 같은 함수를 쓴다. t는 초 단위 시각(performance.now() / 1000).
 */
import { t } from '../i18n';

/** 한 플레이어·봇의 원 모양(정보 카드·정보 창에 같은 모습으로 보여 주려고): 바탕색·테두리·그림·테두리 효과. 봇이면 빨간 바탕 */
export interface OrbLook { bg: string; borderColor: string | null; borderWidth: number | null; art: string | null; borderEffect: string | null; bot: boolean }

export const BORDER_EFFECTS = ['glow', 'dash', 'gradient', 'pulse', 'rainbow'] as const;

/** 이모트 코드 → 이모지. 서버 Room.EMOTES와 같은 순서(숫자 키 1~8) */
export const EMOTES: [string, string, string][] = [
  ['wave', '👋', t('arena.emote_wave')], ['laugh', '😂', t('arena.emote_laugh')], ['cool', '😎', t('arena.emote_cool')], ['cry', '😭', t('arena.emote_cry')],
  ['angry', '😡', t('arena.emote_angry')], ['thumbs', '👍', t('arena.emote_thumbs')], ['heart', '❤️', t('arena.emote_heart')], ['fire', '🔥', t('arena.emote_fire')],
];
export const EMOTE_CHAR: Record<string, string> = Object.fromEntries(EMOTES.map(([c, e]) => [c, e]));

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgba = (hex: string, a: number) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

/**
 * 테두리 효과. 기본 테두리를 그린 뒤 그 위·바깥에 그린다. 크기는 반지름에 비례해서 큰 원도 같은 모습이다.
 * minPx는 화면에서 최소 굵기(줌아웃돼도 보이게, 월드 단위).
 */
export function drawBorderEffect(ctx: CanvasRenderingContext2D, code: string | null | undefined, x: number, y: number, r: number,
                                 bg: string, border: string, lineWidth: number, t: number, minPx = 1) {
  if (!code) return;
  const w = Math.max(lineWidth, minPx * 2);
  ctx.save();
  switch (code) {
    case 'glow': {
      // 테두리 색 빛이 바깥으로 번진다(shadowBlur 대신 옅은 고리 여러 겹, 휴대폰에서도 빠르게)
      const breathe = 0.75 + 0.25 * Math.sin(t * 2.2);
      for (let i = 1; i <= 5; i++) {
        ctx.strokeStyle = rgba(border, (0.22 - i * 0.035) * breathe);
        ctx.lineWidth = w * (0.8 + i * 0.9);
        ctx.beginPath(); ctx.arc(x, y, r + w * i * 0.55, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'dash': {
      // 테두리 바깥에 점선 고리가 천천히 돈다
      const rr = r + w * 1.8 + r * 0.04;
      const seg = (Math.PI * 2 * rr) / 24;
      ctx.setLineDash([seg * 0.55, seg * 0.45]);
      ctx.lineDashOffset = -t * rr * 0.35;
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(w * 0.7, minPx * 1.5);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'gradient': {
      // 바탕색과 테두리 색이 섞인 띠가 돈다
      const g = typeof ctx.createConicGradient === 'function' ? ctx.createConicGradient(t * 1.2, x, y) : null;
      if (g) {
        g.addColorStop(0, border); g.addColorStop(0.5, bg); g.addColorStop(1, border);
        ctx.strokeStyle = g;
      } else {
        ctx.strokeStyle = border;
      }
      ctx.lineWidth = w * 1.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'pulse': {
      // 테두리에서 고리가 퍼져 나가며 옅어진다(1.6초마다 두 개)
      for (let k = 0; k < 2; k++) {
        const p = ((t / 1.6) + k / 2) % 1;
        ctx.strokeStyle = rgba(border, 0.55 * (1 - p));
        ctx.lineWidth = w * (1.2 - p * 0.7);
        ctx.beginPath(); ctx.arc(x, y, r + w + p * r * 0.45, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'rainbow': {
      // 무지개색 테두리가 흐른다
      const g = typeof ctx.createConicGradient === 'function' ? ctx.createConicGradient(-t * 1.5, x, y) : null;
      if (g) {
        ['#ff5e5e', '#ffb020', '#f1e05a', '#3fd67a', '#38bdf8', '#8e7cff', '#ff7eb6', '#ff5e5e']
          .forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
        ctx.strokeStyle = g;
      } else {
        ctx.strokeStyle = `hsl(${(t * 90) % 360},90%,62%)`;
      }
      ctx.lineWidth = w * 1.8;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/**
 * 이름표(4.9): 글자색과 모양(RIBBON 테두리 색 리본 바탕 / GLOW 글자 둘레 빛). 닉네임은 항상 텍스트로만 그린다.
 * (x, y)는 글자 위쪽 가운데.
 */
export function drawNameTag(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, fs: number,
                            color: string | null | undefined, style: string | null | undefined, ribbon: string) {
  ctx.font = `600 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (style === 'RIBBON') {
    const tw = ctx.measureText(label).width, padX = fs * 0.55, h = fs * 1.35;
    ctx.fillStyle = rgba(ribbon, 0.88);
    ctx.beginPath();
    const rx = x - tw / 2 - padX, ry = y - fs * 0.15, rw = tw + padX * 2, rad = h / 2;
    ctx.moveTo(rx + rad, ry); ctx.lineTo(rx + rw - rad, ry); ctx.arc(rx + rw - rad, ry + rad, rad, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(rx + rad, ry + h); ctx.arc(rx + rad, ry + rad, rad, Math.PI / 2, Math.PI * 1.5);
    ctx.fill();
  } else if (style === 'GLOW') {
    for (let i = 3; i >= 1; i--) {
      ctx.lineWidth = fs * 0.22 * i;
      ctx.strokeStyle = rgba(color ?? '#ffffff', 0.12);
      ctx.strokeText(label, x, y);
    }
  }
  ctx.lineWidth = fs / 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.fillStyle = color ?? '#ffffff';
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
}

/**
 * 콤보 불꽃(4.25): 연속으로 빼앗아 기준 콤보에 닿은 원은 둘레가 불꽃 혀로 빈틈없이 둘러싸여 천천히 돌며 일렁인다.
 * 원(바탕)보다 먼저 그려 둘레 바깥으로만 보이게 한다. 바깥 주황 → 가운데 노랑 순서로 세 겹을 칠한다(한 겹에 경로 하나).
 * minPx는 화면에서 최소 크기(월드 단위).
 */
export function drawComboFlames(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, minPx = 1) {
  const len = Math.max(r * 0.5, minPx * 14); // 불꽃 길이
  const n = Math.max(12, Math.min(36, Math.round((Math.PI * 2 * r) / Math.max(r * 0.3, minPx * 8))));
  const spin = t * 0.5;
  const da = (Math.PI / n) * 1.35; // 이웃 불꽃과 겹쳐 빈틈이 없게
  const P = (a: number, d: number): [number, number] => [x + Math.cos(a) * d, y + Math.sin(a) * d];
  ctx.save();
  // 둘레의 은은한 열기
  const glow = ctx.createRadialGradient(x, y, r * 0.9, x, y, r + len * 1.1);
  glow.addColorStop(0, 'rgba(255,120,30,0.45)'); glow.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, r + len * 1.1, 0, Math.PI * 2); ctx.fill();
  const layers: [number, number, string][] = [[1, 1, '#ff4d1a'], [0.7, 0.7, '#ff9f1c'], [0.4, 0.45, '#ffe066']]; // 길이, 폭, 색
  for (const [ls, ws, color] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * Math.PI * 2;
      const base = 0.85 + 0.3 * Math.sin(i * 2.399) ** 2; // 불꽃마다 길이가 조금씩 달라 톱니처럼 보이지 않게
      const f = base * (0.7 + 0.22 * Math.sin(t * 8 + i * 1.7) + 0.08 * Math.sin(t * 13.3 + i * 2.9)); // 일렁임
      const tipD = r + len * f * ls;
      const w = da * ws;
      const bend = w * 0.35 * Math.sin(t * 5 + i); // 끝이 살짝 흔들린다
      const [lx, ly] = P(a - w, r * 0.92), [rx, ry] = P(a + w, r * 0.92);
      const [tx, ty] = P(a + bend, tipD);
      const [c1x, c1y] = P(a - w * 0.9, r + (tipD - r) * 0.45), [c2x, c2y] = P(a + w * 0.9, r + (tipD - r) * 0.45);
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(c1x, c1y, tx, ty);
      ctx.quadraticCurveTo(c2x, c2y, rx, ry);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}
