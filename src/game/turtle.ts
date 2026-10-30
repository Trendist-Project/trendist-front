/**
 * 성장 아이콘(4.9): 거북이를 위에서 내려다본 모습. 원(아이콘) 안에만 그린다.
 * 1레벨은 무늬 없는 원이고, 레벨이 오를 때마다 부위가 하나씩 흐릿하게 생겨 점점 진해지다가 10레벨에 완성된다.
 * 11레벨부터는 10레벨 모습 그대로다.
 *
 * 부위가 생기는 레벨: 2 등껍질 → 3 가운데 무늬 → 4 바깥 무늬 → 5 머리 → 6 눈 → 7 앞발 → 8 뒷발·꼬리 → 9 웃는 입·볼 → 10 등껍질 광택
 */

export const TURTLE_BASE = '#3fb68b'; // 성장 캐릭터의 정해진 바탕색(4.9)

/** 테두리 두께(4.9): 꾸민 두께는 1~8단계로 반지름에 비례한다(큰 원에서도 보이게). null이면 기본 테두리 */
export function borderLineWidth(r: number, step: number | null) {
  return step ? Math.max(1.5, r * 0.03 * step) : Math.max(2, r * 0.08);
}
const SHELL = '#2a8a66';
const SHELL_LINE = '#17573f';
const SKIN = '#9be0b8';
const SKIN_LINE = '#3d8f67';
const COMPLETE = 10;

/** 그 부위가 생긴 레벨부터 10레벨까지 진하기가 0.25 → 1로 올라간다. 아직 안 생겼으면 0. */
function reveal(level: number, appear: number) {
  if (level < appear) return 0;
  if (appear >= COMPLETE) return 1;
  return 0.25 + 0.75 * Math.min(1, (level - appear) / (COMPLETE - appear));
}

/**
 * 바탕 원은 호출하는 쪽이 그린다. 여기서는 그 위에 거북이 부위만 그린다(원 밖으로 나가지 않게 잘라 낸다).
 * angle: 머리 방향(라디안). 0이면 위(화면 북쪽)를 보고, 시계 방향으로 돈다(4.2: 가는 쪽을 바라본다).
 */
export function drawTurtle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, level: number, angle = 0) {
  const lv = Math.min(level, COMPLETE);
  if (lv < 2) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(r, r); // 이후 좌표는 반지름 1 기준
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const line = (w: number) => { ctx.lineWidth = w; };

  const shellCy = 0.1, shellR = 0.56;

  // 앞발·뒷발·꼬리·머리는 등껍질 밑에 깔리도록 먼저 그린다
  const front = reveal(lv, 7), back = reveal(lv, 8), head = reveal(lv, 5);
  const flipper = (cx: number, cy: number, rx: number, ry: number, rot: number, a: number) => {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = SKIN; ctx.strokeStyle = SKIN_LINE; line(0.035);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  flipper(-0.55, -0.22, 0.24, 0.12, -0.55, front);
  flipper(0.55, -0.22, 0.24, 0.12, 0.55, front);
  flipper(-0.5, 0.52, 0.18, 0.1, 0.6, back);
  flipper(0.5, 0.52, 0.18, 0.1, -0.6, back);
  if (back > 0) {
    ctx.globalAlpha = back;
    ctx.fillStyle = SKIN; ctx.strokeStyle = SKIN_LINE; line(0.035);
    ctx.beginPath(); ctx.moveTo(-0.08, 0.62); ctx.lineTo(0, 0.86); ctx.lineTo(0.08, 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (head > 0) {
    ctx.globalAlpha = head;
    ctx.fillStyle = SKIN; ctx.strokeStyle = SKIN_LINE; line(0.035);
    ctx.beginPath(); ctx.ellipse(0, -0.6, 0.25, 0.23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // 등껍질
  const shell = reveal(lv, 2);
  ctx.globalAlpha = shell;
  ctx.fillStyle = SHELL; ctx.strokeStyle = SHELL_LINE; line(0.05);
  ctx.beginPath(); ctx.arc(0, shellCy, shellR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // 등껍질 무늬: 가운데 육각형, 그 꼭짓점에서 테두리로 뻗는 선
  const hexR = 0.24;
  const hex = Array.from({ length: 6 }, (_, i) => {
    const t = -Math.PI / 2 + (i * Math.PI) / 3;
    return [Math.cos(t) * hexR, shellCy + Math.sin(t) * hexR] as const;
  });
  const center = reveal(lv, 3), outer = reveal(lv, 4);
  if (center > 0) {
    ctx.globalAlpha = center;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = SHELL_LINE; line(0.04);
    ctx.beginPath(); hex.forEach(([hx, hy], i) => (i ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy))); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (outer > 0) {
    ctx.globalAlpha = outer;
    ctx.strokeStyle = SHELL_LINE; line(0.035);
    for (const [hx, hy] of hex) {
      const dx = hx, dy = hy - shellCy, len = Math.hypot(dx, dy);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo((dx / len) * shellR * 0.97, shellCy + (dy / len) * shellR * 0.97); ctx.stroke();
    }
  }

  // 얼굴: 눈 → 웃는 입·볼
  const eyes = reveal(lv, 6), smile = reveal(lv, 9);
  if (eyes > 0) {
    ctx.globalAlpha = eyes;
    for (const sx of [-0.1, 0.1]) {
      ctx.fillStyle = '#10261b';
      ctx.beginPath(); ctx.arc(sx, -0.66, 0.055, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sx + 0.018, -0.68, 0.02, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (smile > 0) {
    ctx.globalAlpha = smile;
    ctx.strokeStyle = '#10261b'; line(0.03);
    ctx.beginPath(); ctx.arc(0, -0.6, 0.07, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,128,140,0.55)';
    for (const sx of [-0.16, 0.16]) { ctx.beginPath(); ctx.ellipse(sx, -0.56, 0.04, 0.025, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  // 10레벨: 등껍질 광택으로 완성을 표시한다
  if (lv >= COMPLETE) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffffff'; line(0.05);
    ctx.beginPath(); ctx.arc(0, shellCy, shellR * 0.8, -0.85 * Math.PI, -0.6 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}
