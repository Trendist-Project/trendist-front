/**
 * 무적 고리 연출(4.33). 황금 방벽 돔: 육각 무늬 반투명 금빛 막 위로 빛줄기가 훑고, 육각 칸이 차례로 반짝인다.
 * r은 고리 반지름, z는 줌(선 굵기를 화면 기준으로 맞춘다). 남은 초 글자와 끝날 때 옅어짐은 호출하는 쪽이 맡는다.
 */
const TAU = Math.PI * 2;
const hash = (i: number, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

type Ctx = CanvasRenderingContext2D;
const disc = (ctx: Ctx, x: number, y: number, r: number, inner: number, rgb: string, a: number) => {
  const g = ctx.createRadialGradient(x, y, r * inner, x, y, r);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${a})`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};

/** 육각 무늬 황금 방벽 돔. 반투명 금빛 막 위로 빛줄기가 훑고 지나가고, 육각 칸이 차례로 반짝인다 */
function dome(ctx: Ctx, x: number, y: number, r: number, now: number, z: number, calm: boolean) {
  const R = r * 1.05;
  disc(ctx, x, y, R, 0.45, '255,200,70', 0.34);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
  const h = R * 0.3, w = h * Math.sqrt(3);
  for (let row = -4; row <= 4; row++) for (let col = -4; col <= 4; col++) {
    const cx = x + col * w + (row & 1 ? w / 2 : 0), cy = y + row * h * 1.5;
    if (Math.hypot(cx - x, cy - y) > R + h) continue;
    const tw = calm ? 0.3 : Math.max(0, Math.sin(now / 420 + hash(row * 9 + col) * TAU));
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6 + Math.PI / 6; ctx.lineTo(cx + Math.cos(a) * h * 0.95, cy + Math.sin(a) * h * 0.95); }
    ctx.closePath(); ctx.fillStyle = `rgba(255,225,130,${0.04 + 0.2 * tw * tw})`; ctx.fill();
    ctx.strokeStyle = `rgba(255,214,100,${0.28 + 0.3 * tw})`; ctx.lineWidth = 1.2 / z; ctx.stroke();
  }
  // 훑고 지나가는 빛줄기
  const sw = calm ? 0.5 : (now / 1800) % 1, bx = x - R + sw * R * 2.4 - R * 0.2;
  const g = ctx.createLinearGradient(bx - R * 0.3, y - R, bx + R * 0.3, y + R);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,220,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.lineWidth = 4 / z; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,248,214,0.8)'; ctx.lineWidth = 1.4 / z; ctx.beginPath(); ctx.arc(x, y, R - 3 / z, 0, TAU); ctx.stroke();
}

/** 무적 고리 본체를 그린다(호출하는 쪽이 globalAlpha를 정해 둔다) */
export function paintInvincible(ctx: Ctx, x: number, y: number, r: number, now: number, z: number, calm = false) {
  dome(ctx, x, y, r, now, z, calm);
}
