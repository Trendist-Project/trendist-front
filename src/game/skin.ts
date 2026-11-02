/**
 * 원 꾸미기 그리기(4.9, 4.25, 4.26): 테두리 효과, 이름표, 궤도 위성, 이모트.
 * 아레나·꾸미기 미리 보기가 같은 함수를 쓴다. t는 초 단위 시각(performance.now() / 1000).
 */

export const BORDER_EFFECTS = ['glow', 'dash', 'gradient', 'pulse', 'rainbow'] as const;

/** 이모트 코드 → 이모지. 서버 Room.EMOTES와 같은 순서(숫자 키 1~8) */
export const EMOTES: [string, string, string][] = [
  ['wave', '👋', '안녕'], ['laugh', '😂', '웃음'], ['cool', '😎', '여유'], ['cry', '😭', '울음'],
  ['angry', '😡', '화남'], ['thumbs', '👍', '좋아'], ['heart', '❤️', '하트'], ['fire', '🔥', '불타오름'],
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
 * 궤도 위성(4.25): 연속 빼앗기로 얻은 위성이 원 둘레를 돈다. n개가 같은 간격으로 늘어서고, 꼬리 빛을 남긴다.
 * minPx는 화면에서 최소 크기(월드 단위).
 */
export function drawOrbits(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, t: number, minPx = 1) {
  if (n <= 0) return;
  const orbit = r * 1.35 + minPx * 10;
  const size = Math.max(r * 0.09, minPx * 4);
  const speed = 1.6 * (60 / Math.max(60, r)) ** 0.4; // 큰 원은 조금 느리게 돌아야 자연스럽다
  ctx.save();
  // 궤도 선
  ctx.strokeStyle = 'rgba(255,215,120,0.18)';
  ctx.lineWidth = Math.max(1, minPx);
  ctx.beginPath(); ctx.ellipse(x, y, orbit, orbit, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const a = t * speed + (i / n) * Math.PI * 2;
    for (let k = 4; k >= 1; k--) { // 꼬리
      const ta = a - k * 0.09;
      ctx.fillStyle = `rgba(255,209,102,${0.12 * (5 - k) / 4})`;
      ctx.beginPath(); ctx.arc(x + Math.cos(ta) * orbit, y + Math.sin(ta) * orbit, size * (1 - k * 0.12), 0, Math.PI * 2); ctx.fill();
    }
    const sx = x + Math.cos(a) * orbit, sy = y + Math.sin(a) * orbit;
    const g = ctx.createRadialGradient(sx - size * 0.3, sy - size * 0.3, size * 0.1, sx, sy, size);
    g.addColorStop(0, '#fffbe6'); g.addColorStop(0.5, '#ffd166'); g.addColorStop(1, '#ff9f1c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
