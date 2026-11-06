/**
 * 레벨업 이펙트(4.30): 레벨이 오르면 그 원에서 금빛 빛기둥이 솟아오른다. 꾸미기로 고르는 것이 아니라 모두에게 같은 고정 연출이다.
 * 한 번 터지고 사라지는 연출이라 입자를 저장하지 않고, 시작한 뒤 지난 시간(0~1)만으로 매 프레임 그린다.
 */
export const LEVELUP_MS = 1500;
/** 화면에 동시에 남기는 효과 수 상한(많이 몰려도 프레임이 떨어지지 않게) */
export const FX_MAX = 24;

export interface LevelFx { e: number; at: number; level: number; x: number; y: number; r: number }

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** 한 프레임을 그린다. t는 0~1(시작 → 끝), z는 화면 배율(작은 원이라도 화면 기준 최소 크기로 보이게 한다) */
export function drawLevelUp(ctx: CanvasRenderingContext2D, fx: LevelFx, t: number, z: number) {
  if (t < 0 || t >= 1) return;
  const R = Math.max(fx.r, 22 / z);
  const { x, y } = fx, p = easeOut(t);
  const fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  // 빛기둥: 아래(원)에서 위로 솟아오르며 위쪽은 투명해진다
  const h = R * 6 * p, w = R * 1.1 * (1 - t * 0.4);
  const g = ctx.createLinearGradient(0, y - h, 0, y + R);
  g.addColorStop(0, 'rgba(255,226,122,0)'); g.addColorStop(1, 'rgba(255,226,122,0.85)');
  ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - h, w, h + R * 0.2);
  // 발밑에 퍼지는 빛 고리
  ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = Math.max(2 / z, R * 0.08);
  ctx.beginPath(); ctx.ellipse(x, y + R * 0.2, R * (1 + p), R * 0.35 * (1 + p), 0, 0, Math.PI * 2); ctx.stroke();
  // "Lv.N"이 위로 떠오른다
  const fs = Math.max(R * 0.55, 15 / z);
  ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = fs * 0.18; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = '#ffe27a';
  const ty = y - R * (1.5 + p * 1.2);
  ctx.strokeText(`Lv.${fx.level}`, x, ty); ctx.fillText(`Lv.${fx.level}`, x, ty);
  ctx.restore();
}
