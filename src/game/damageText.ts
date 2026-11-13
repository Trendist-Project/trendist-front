/**
 * 피해 숫자 그리기(메이플 키우기 같은 방치형 RPG의 데미지 스킨 느낌): 굵고 기울어진 숫자에 위아래 그라데이션과 두꺼운 어두운 테두리,
 * 나타날 때 커졌다 자리 잡는 팝 효과, 숫자가 한 글자씩 시차를 두고 통통 튀고, 위로 떠오르며 사라진다. 크리티컬은 더 크고 번쩍이며 반짝이가 붙는다.
 *
 * kind: hit(내가 입힌 일반 피해·주황 노랑) / crit(불꽃 타격·분홍) / taken(내가 입은 피해·보라) / other(다른 사람이 입은 피해·주황)
 */
export type DmgKind = 'hit' | 'crit' | 'taken' | 'other' | 'lose';

interface Skin { top: string; mid: string; bot: string; stroke: string; glow: string; label?: string }
const SKINS: Record<DmgKind, Skin> = {
  hit:   { top: '#fff1d6', mid: '#ffb347', bot: '#ff7a00', stroke: '#4d2000', glow: 'rgba(255,140,20,0.6)' },
  crit:  { top: '#fff2fb', mid: '#ff8fd6', bot: '#e5308e', stroke: '#47073a', glow: 'rgba(255,80,190,0.75)', label: 'CRITICAL' },
  taken: { top: '#f5ebff', mid: '#b98cff', bot: '#7a3fe0', stroke: '#26085a', glow: 'rgba(150,90,255,0.7)' },
  other: { top: '#fff1d6', mid: '#ffb347', bot: '#ff7a00', stroke: '#4d2000', glow: 'rgba(255,140,20,0.6)' },
  lose:  { top: '#ffe6e9', mid: '#ff6577', bot: '#d9142d', stroke: '#4a0510', glow: 'rgba(255,70,100,0.75)' }, // 스킬로 키워드를 잃었다(충격파)
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** 4갈래 반짝이(크리티컬 장식) */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/**
 * 숫자 하나를 그린다. (x, y)는 숫자 가운데 아래, p는 0~1 진행(0 나타남 → 1 사라짐), size는 글자 크기(세계 좌표 px).
 * 모션 줄이기면 팝·통통·떠오름 없이 제자리에서 사라진다.
 */
export function drawDamage(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: number, kind: DmgKind, size: number, reduceMotion = false) {
  const skin = SKINS[kind], crit = kind === 'crit';
  // 팝: 작게 시작해 살짝 넘치게 커졌다가 자리 잡는다(크리티컬은 더 크게 넘친다)
  const popT = clamp01(p / 0.16), settleT = clamp01((p - 0.16) / 0.16);
  const over = crit ? 0.55 : 0.3;
  const scale = reduceMotion ? 1 : popT < 1 ? 0.35 + (1 + over - 0.35) * easeOut(popT) : 1 + over * (1 - easeOut(settleT));
  const rise = reduceMotion ? 0 : easeOut(clamp01(p / 0.9)) * size * 2.4;
  const alpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
  const cx = x, cy = y - rise;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(cx, cy); ctx.scale(scale, scale);
  ctx.font = `italic 900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';

  // 글자별 폭을 재서 가운데 맞추고, 글자마다 시차를 두고 통통 튄다
  const chars = [...text], widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let ox = -total / 2;
  const grad = ctx.createLinearGradient(0, -size * 0.82, 0, size * 0.05);
  grad.addColorStop(0, skin.top); grad.addColorStop(0.45, skin.mid); grad.addColorStop(1, skin.bot);
  const outline = size * (crit ? 0.2 : 0.17);
  for (let i = 0; i < chars.length; i++) {
    const hopT = clamp01((p - 0.04 - i * 0.025) / 0.14);
    const hop = reduceMotion ? 0 : -Math.sin(hopT * Math.PI) * size * (crit ? 0.3 : 0.2);
    const gx = ox, gy = hop;
    ctx.lineWidth = outline * 2.1; ctx.strokeStyle = skin.glow; ctx.strokeText(chars[i], gx, gy);   // 바깥 빛
    ctx.lineWidth = outline; ctx.strokeStyle = skin.stroke; ctx.strokeText(chars[i], gx, gy);        // 어두운 테두리
    ctx.fillStyle = grad; ctx.fillText(chars[i], gx, gy);
    ctx.save(); ctx.globalAlpha *= 0.5; ctx.fillStyle = '#ffffff';                                    // 윗면 하이라이트
    ctx.beginPath(); ctx.rect(gx, gy - size * 0.82, widths[i], size * 0.16); ctx.clip(); ctx.fillText(chars[i], gx, gy); ctx.restore();
    ox += widths[i];
  }

  if (crit) { // 크리티컬: 위에 작은 글자와 반짝이
    const ly = -size * 1.0;
    ctx.font = `italic 900 ${size * 0.34}px "Arial Black", Impact, system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = skin.stroke; ctx.strokeText(skin.label ?? '', 0, ly);
    ctx.fillStyle = '#ffd3f0'; ctx.fillText(skin.label ?? '', 0, ly);
    if (!reduceMotion) {
      const tw = clamp01(Math.sin(p * Math.PI * 4) * 0.5 + 0.5);
      sparkle(ctx, -total / 2 - size * 0.15, -size * 0.55, size * (0.16 + 0.1 * tw), '#ffffff');
      sparkle(ctx, total / 2 + size * 0.1, -size * 0.75, size * (0.12 + 0.12 * (1 - tw)), '#ffd3f0');
    }
  }
  ctx.restore();
}
