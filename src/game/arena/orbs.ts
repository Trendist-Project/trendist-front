/**
 * 아레나의 구슬(4.20): ? 구슬(금색)과 ! 구슬(불꽃에게 키워드를 모두 잃은 자리에 떨어짐, 붉은색).
 * 떠 있는 구슬, 먹혀서 원 안으로 빨려 드는 구슬, 먹은 원이 한 번 부푸는 것까지 여기서 들고 그린다. Arena는 서버 메시지를 넘기고 그릴 때 부르기만 한다.
 */

/** 서버 반지름 14px, 화면에서는 위아래로 살짝 떠다닌다 */
const ORB_RADIUS = 14;
const ORB_GROW_MS = 350;   // 생길 때 커지는 시간
const ORB_EAT_MS = 380;    // 먹힐 때 원 안으로 빨려 들어가는 시간
const GULP_MS = 320;       // 먹은 원이 한 번 부풀었다 돌아오는 시간

interface Orb { x: number; y: number; born: number; phase: number; prize: boolean }
interface EatenOrb { x: number; y: number; e: number; at: number; prize: boolean }

/** 화면에 그려지는 원 위치(나는 예측 위치). 없으면 null */
export type EntityPosFn = (e: number, now: number) => { x: number; y: number; r: number } | null;

export class OrbLayer {
  private orbs = new Map<number, Orb>();
  private eaten: EatenOrb[] = [];
  private gulps = new Map<number, number>(); // 엔티티 번호 → 구슬을 먹은 시각
  private sprites: (HTMLCanvasElement | null)[] = [null, null]; // [? 구슬, ! 구슬]

  constructor(private readonly reducedMotion: boolean) {}

  /** 입장할 때 받은 구슬 전체 목록([번호, x, y, 종류(1이면 !)]) */
  setAll(list: [number, number, number, number?][]) {
    const now = performance.now();
    this.orbs = new Map(list.map(([id, x, y, kind]) => [id, { x, y, born: now - ORB_GROW_MS, phase: Math.random() * Math.PI * 2, prize: kind === 1 }]));
  }

  add(id: number, x: number, y: number, prize = false) {
    this.orbs.set(id, { x, y, born: performance.now(), phase: Math.random() * Math.PI * 2, prize });
  }

  /** 누가(e) 구슬을 먹었다. e가 0이면 영역 밖으로 사라진 것이라 그냥 지운다 */
  eat(id: number, e: number) {
    const o = this.orbs.get(id);
    this.orbs.delete(id);
    if (!o || e === 0) return;
    const now = performance.now();
    this.eaten.push({ x: o.x, y: o.y, e, at: now, prize: o.prize });
    this.gulps.set(e, now);
  }

  /** 미니맵 점을 찍으려고 구슬 위치를 돌려준다 */
  all(): Iterable<{ x: number; y: number; prize: boolean }> { return this.orbs.values(); }

  /** 구슬을 막 먹은 원은 한 번 부푼다: 지금 반지름 배수(평소 1) */
  gulpScale(e: number, now: number) {
    const at = this.gulps.get(e);
    if (at === undefined) return 1;
    const t = (now - at - ORB_EAT_MS * 0.6) / GULP_MS; // 구슬이 거의 들어갔을 때 부푼다
    if (t >= 1) { this.gulps.delete(e); return 1; }
    if (t <= 0 || this.reducedMotion) return 1;
    return 1 + 0.12 * Math.sin(Math.PI * t);
  }

  /** 떠 있는 구슬(화면 근처만). view는 카메라 중심, z는 줌 */
  draw(ctx: CanvasRenderingContext2D, now: number, view: { x: number; y: number }, z: number, w: number, h: number) {
    if (this.orbs.size === 0) return;
    const viewHalfW = w / 2 / z, viewHalfH = h / 2 / z;
    for (const o of this.orbs.values()) {
      if (Math.abs(o.x - view.x) > viewHalfW + 40 || Math.abs(o.y - view.y) > viewHalfH + 40) continue;
      const grow = Math.min(1, (now - o.born) / ORB_GROW_MS);
      const pop = grow < 1 ? 1 - (1 - grow) ** 3 : 1;
      const bob = this.reducedMotion ? 0 : Math.sin(now / 520 + o.phase) * 4; // 둥실둥실
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(now / 300 + o.phase) * 0.06;
      const r = Math.max(ORB_RADIUS, 9 / z) * pop * pulse; // 멀리서 봐도 보이게
      this.ball(ctx, o.x, o.y + bob, r, 1, o.prize);
    }
  }

  /** 먹힌 구슬: 먹은 원 가운데로 빨려 들어가며 작아지고, 반짝이는 고리가 퍼진다 */
  drawEaten(ctx: CanvasRenderingContext2D, now: number, z: number, pos: EntityPosFn) {
    this.eaten = this.eaten.filter((o) => now - o.at < ORB_EAT_MS + 260);
    for (const o of this.eaten) {
      const target = pos(o.e, now);
      const t = Math.min(1, (now - o.at) / ORB_EAT_MS);
      if (t < 1) {
        const ease = t * t * (3 - 2 * t);
        const tx = target ? target.x : o.x, ty = target ? target.y : o.y;
        const x = this.reducedMotion ? o.x : o.x + (tx - o.x) * ease;
        const y = this.reducedMotion ? o.y : o.y + (ty - o.y) * ease;
        this.ball(ctx, x, y, Math.max(ORB_RADIUS, 9 / z) * (1 - ease * 0.85), 1 - t * 0.5, o.prize);
      }
      // 먹은 원 둘레에서 금빛 고리가 퍼지며 사라진다
      const tr = (now - o.at - ORB_EAT_MS * 0.6) / 420;
      if (target && tr > 0 && tr < 1) {
        ctx.strokeStyle = `rgba(255,209,102,${0.9 * (1 - tr)})`;
        ctx.lineWidth = (4 * (1 - tr) + 1) / z;
        ctx.beginPath(); ctx.arc(target.x, target.y, target.r + (8 + 26 * tr) / z, 0, Math.PI * 2); ctx.stroke();
        if (!this.reducedMotion) {
          ctx.fillStyle = `rgba(255,240,180,${1 - tr})`;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + o.at;
            const d = target.r + (6 + 34 * tr) / z;
            ctx.beginPath(); ctx.arc(target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, (2.5 * (1 - tr) + 0.5) / z, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
  }

  /** 구슬 그림은 한 번만 그려 두고 크기만 바꿔 찍는다(매 프레임 구슬마다 그라데이션을 만들지 않게) */
  private ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, prize = false) {
    const kind = prize ? 1 : 0;
    let sprite = this.sprites[kind];
    if (!sprite) {
      const base = 32, size = Math.ceil(base * 2.2 * 2);
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      if (!g) return;
      paintOrb(g, size / 2, size / 2, base, prize);
      sprite = this.sprites[kind] = c;
    }
    const R = r * 2.2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - R, y - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
  }
}

/** prize면 ! 구슬: 금색 ? 구슬과 구별되게 붉은 빛과 몸통으로 그린다 */
function paintOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, prize = false) {
  const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.2);
  glow.addColorStop(0, prize ? 'rgba(255,90,90,0.6)' : 'rgba(255,209,102,0.55)');
  glow.addColorStop(1, prize ? 'rgba(255,90,90,0)' : 'rgba(255,209,102,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, prize ? '#ffd6d6' : '#fff3c4');
  body.addColorStop(0.55, prize ? '#ff5a5a' : '#ffc84a');
  body.addColorStop(1, prize ? '#b81d1d' : '#e08a00');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.fillStyle = prize ? '#ffffff' : '#5a3200';
  ctx.font = `800 ${Math.round(r * 1.25)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(prize ? '!' : '?', x, y + r * 0.06);
  ctx.textBaseline = 'alphabetic';
}
