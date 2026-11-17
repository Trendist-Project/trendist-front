/**
 * 스킬 연출이 함께 쓰는 도형(4.33): 별 모양 폭발과 총알. 터지는 총알의 날아가는 모습(boltLooks.ts)과 맞은 원 머리 위 배지(zones.ts)가
 * 같은 그림을 쓰도록 한 곳에 둔다(스킬 아이콘 SVG는 ui/SkillIcon.tsx에 같은 색·모양으로 따로 그려 둔다).
 */
type Ctx = CanvasRenderingContext2D;

/** 별 모양(뾰족한 끝 n개, 바깥 반지름 ro, 안쪽 반지름 ri, 시작 각도 rot) 경로를 만든다. 칠하고 선 긋는 것은 부르는 쪽이 한다 */
export function starPath(ctx: Ctx, x: number, y: number, n: number, ro: number, ri: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n, r = i % 2 === 0 ? ro : ri;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** 겹겹이 타오르는 별 모양 폭발(주황 → 연한 주황 → 노랑). R은 바깥 반지름, edge는 바깥 테두리 두께 */
export function drawExplosion(ctx: Ctx, x: number, y: number, R: number, edge: number) {
  ctx.strokeStyle = '#2b1408'; ctx.lineWidth = edge;
  ctx.fillStyle = '#ff6a2a'; starPath(ctx, x, y, 10, R, R * 0.58); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffb347'; starPath(ctx, x, y, 10, R * 0.76, R * 0.43); ctx.fill();
  ctx.fillStyle = '#fff3b0'; starPath(ctx, x, y, 8, R * 0.54, R * 0.3); ctx.fill();
}

/** 총알의 치수: 뒤끝(back)·탄피와 탄두의 경계(neck)·뾰족한 끝(tip)은 진행 방향 축 위의 위치, w는 반폭 */
export interface BulletSize { back: number; neck: number; tip: number; w: number }

/**
 * 총알 하나: (x, y)에서 angle 방향을 향한 황동 탄피와 주황 탄두. glow(0~1)가 클수록 탄두가 달아오른 색이다. line은 테두리 두께.
 * shine이면 윗면 반사광을 더한다(날아가는 큰 그림에만).
 */
export function drawBullet(ctx: Ctx, x: number, y: number, angle: number, s: BulletSize, line: number, glow = 0.8, shine = false) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const w = s.w, cg = ctx.createLinearGradient(0, -w, 0, w);
  cg.addColorStop(0, '#fff0b8'); cg.addColorStop(0.45, '#e0a23a'); cg.addColorStop(1, '#8a5a12');
  ctx.fillStyle = cg; ctx.strokeStyle = '#3a2208'; ctx.lineWidth = line;
  ctx.beginPath(); ctx.roundRect(s.back, -w, s.neck - s.back, w * 2, w * 0.28); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(58,34,8,0.7)'; ctx.lineWidth = line * 0.65;
  ctx.beginPath(); ctx.moveTo(s.back + (s.neck - s.back) * 0.18, -w); ctx.lineTo(s.back + (s.neck - s.back) * 0.18, w); ctx.stroke(); // 탄피 이음선
  const tg = ctx.createLinearGradient(0, -w, 0, w), mid = s.neck + (s.tip - s.neck) * 0.7;
  tg.addColorStop(0, '#ffd9a0'); tg.addColorStop(0.5, `rgb(255,${Math.floor(110 + 70 * glow)},50)`); tg.addColorStop(1, '#8a2a0c');
  ctx.fillStyle = tg; ctx.strokeStyle = '#3a1608'; ctx.lineWidth = line;
  ctx.beginPath(); ctx.moveTo(s.neck, -w); ctx.quadraticCurveTo(mid, -w * 0.95, s.tip, 0); ctx.quadraticCurveTo(mid, w * 0.95, s.neck, w); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (shine) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = line * 0.85;
    ctx.beginPath(); ctx.moveTo(s.back + w * 0.3, -w * 0.55); ctx.lineTo(s.neck + (s.tip - s.neck) * 0.45, -w * 0.5); ctx.stroke();
  }
  ctx.restore();
}
