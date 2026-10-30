/**
 * 이동 효과(4.23): 움직이는 원 뒤에 남는 잔상·입자. 서버는 효과 코드만 알려 주고 그림은 여기서 그린다.
 * 입자는 시간이 아니라 움직인 거리마다 만든다(멈춰 있으면 생기지 않고, 빨리 갈수록 촘촘하다).
 * 크기는 원의 반지름에 비례하고, 엔티티마다·전체 입자 수에 상한을 둔다(휴대폰 부담).
 */

export const TRAIL_CODES = ['afterimage', 'sparkle', 'flame', 'bubble', 'rainbow', 'footprint', 'petal'] as const;
export type TrailCode = (typeof TRAIL_CODES)[number];

interface Particle { x: number; y: number; vx: number; vy: number; size: number; born: number; life: number; rot: number; vr: number; hue: number }
interface PathPoint { x: number; y: number; r: number; t: number }
interface Track {
  code: TrailCode; color: string;
  parts: Particle[]; path: PathPoint[];
  lastX: number; lastY: number; dist: number; step: number; seen: number;
}

const MAX_PER_TRACK = 90;
const MAX_TOTAL = 1500;
/** 한 프레임에 이보다 멀리 움직였으면 순간 이동(입장·보정)으로 보고 효과를 만들지 않는다 */
const TELEPORT = 400;

/** 효과별: 입자 간격(반지름 배수, 최소 px), 수명(ms). 길(path)형은 점 간격 */
const SPEC: Record<TrailCode, { gap: number; minGap: number; life: number }> = {
  afterimage: { gap: 0.45, minGap: 10, life: 380 },
  sparkle: { gap: 0.3, minGap: 9, life: 950 },
  flame: { gap: 0.22, minGap: 8, life: 600 },
  bubble: { gap: 0.4, minGap: 12, life: 1300 },
  rainbow: { gap: 0.18, minGap: 6, life: 650 },
  footprint: { gap: 0.6, minGap: 14, life: 1700 },
  petal: { gap: 0.35, minGap: 11, life: 1500 },
};

export function isTrailCode(code: string | null | undefined): code is TrailCode {
  return !!code && (TRAIL_CODES as readonly string[]).includes(code);
}

export class Trails {
  private tracks = new Map<number, Track>();
  private total = 0;
  private frame = 0;

  /**
   * 엔티티 하나의 이번 프레임 위치. code가 없으면 그 엔티티의 효과를 지운다.
   * color는 그 원의 바탕색(잔상에 쓴다).
   */
  update(id: number, code: string | null | undefined, x: number, y: number, r: number, now: number, color: string) {
    if (!isTrailCode(code)) { this.drop(id); return; }
    let t = this.tracks.get(id);
    if (!t || t.code !== code) {
      if (t) this.drop(id);
      t = { code, color, parts: [], path: [], lastX: x, lastY: y, dist: 0, step: 0, seen: this.frame };
      this.tracks.set(id, t);
    }
    t.color = color; t.seen = this.frame;
    const dx = x - t.lastX, dy = y - t.lastY, moved = Math.hypot(dx, dy);
    if (moved > TELEPORT) { t.lastX = x; t.lastY = y; t.dist = 0; return; }
    if (moved < 0.01) return;
    const spec = SPEC[code];
    const gap = Math.max(spec.minGap, r * spec.gap);
    t.dist += moved;
    const ux = dx / moved, uy = dy / moved; // 가는 방향
    let made = 0;
    // 지나온 선분 위에 간격마다 놓는다. 한 프레임에 너무 많이 만들지 않는다
    while (t.dist >= gap && made < 4) {
      t.dist -= gap;
      const back = t.dist; // 지금 위치에서 뒤로 이만큼
      this.emit(t, x - ux * back, y - uy * back, ux, uy, r, now);
      made++;
    }
    if (made === 4) t.dist = 0;
    t.lastX = x; t.lastY = y;
  }

  private emit(t: Track, x: number, y: number, ux: number, uy: number, r: number, now: number) {
    const life = SPEC[t.code].life;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const px = -uy, py = ux; // 가는 방향에 수직
    if (t.code === 'afterimage' || t.code === 'rainbow') {
      t.path.push({ x, y, r, t: now });
      if (t.path.length > 40) t.path.shift();
      return;
    }
    if (t.parts.length >= MAX_PER_TRACK || this.total >= MAX_TOTAL) return;
    const s = Math.max(r, 18);
    const tail = r * 0.75; // 원의 뒤쪽 가장자리 근처에서 나온다
    let p: Particle;
    switch (t.code) {
      case 'sparkle': {
        const side = rnd(-0.8, 0.8) * r;
        p = { x: x - ux * tail * 0.6 + px * side, y: y - uy * tail * 0.6 + py * side, vx: rnd(-12, 12), vy: rnd(-12, 12),
          size: s * rnd(0.1, 0.2), born: now, life: life * rnd(0.7, 1.1), rot: rnd(0, Math.PI), vr: rnd(-2, 2), hue: rnd(40, 60) };
        break;
      }
      case 'flame': {
        const side = rnd(-0.45, 0.45) * r;
        const sp = rnd(30, 80);
        p = { x: x - ux * tail + px * side, y: y - uy * tail + py * side, vx: -ux * sp + rnd(-15, 15), vy: -uy * sp + rnd(-15, 15),
          size: s * rnd(0.2, 0.34), born: now, life: life * rnd(0.7, 1.1), rot: 0, vr: 0, hue: rnd(20, 45) };
        break;
      }
      case 'bubble': {
        const side = rnd(-0.6, 0.6) * r;
        p = { x: x - ux * tail + px * side, y: y - uy * tail + py * side, vx: rnd(-6, 6), vy: -rnd(14, 30),
          size: s * rnd(0.1, 0.22), born: now, life: life * rnd(0.75, 1.15), rot: rnd(0, Math.PI * 2), vr: rnd(2, 4), hue: 0 };
        break;
      }
      case 'footprint': {
        t.step ^= 1;
        const side = (t.step ? 1 : -1) * r * 0.32;
        p = { x: x - ux * r * 0.2 + px * side, y: y - uy * r * 0.2 + py * side, vx: 0, vy: 0,
          size: s * 0.16, born: now, life, rot: Math.atan2(uy, ux) + Math.PI / 2, vr: 0, hue: 0 };
        break;
      }
      case 'petal': {
        const side = rnd(-0.7, 0.7) * r;
        p = { x: x - ux * tail + px * side, y: y - uy * tail + py * side, vx: -ux * rnd(10, 30) + rnd(-12, 12), vy: -uy * rnd(10, 30) + rnd(4, 20),
          size: s * rnd(0.13, 0.2), born: now, life: life * rnd(0.8, 1.1), rot: rnd(0, Math.PI * 2), vr: rnd(-3, 3), hue: rnd(330, 355) };
        break;
      }
      default: return;
    }
    t.parts.push(p);
    this.total++;
  }

  private drop(id: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    this.total -= t.parts.length;
    this.tracks.delete(id);
  }

  /** 이번 프레임에 update되지 않은 엔티티(나갔거나 화면 밖)의 효과는 남은 입자가 사라질 때까지만 그린다. */
  draw(ctx: CanvasRenderingContext2D, now: number, dt: number) {
    for (const [id, t] of this.tracks) {
      // 오래된 입자·점을 버린다
      const life = SPEC[t.code].life;
      const before = t.parts.length;
      t.parts = t.parts.filter((p) => now - p.born < p.life);
      this.total -= before - t.parts.length;
      while (t.path.length && now - t.path[0].t > life) t.path.shift();
      if (t.seen !== this.frame && t.parts.length === 0 && t.path.length === 0) { this.tracks.delete(id); continue; }
      for (const p of t.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      ctx.save();
      DRAW[t.code](ctx, t, now, life);
      ctx.restore();
    }
    this.frame++;
  }

  clear() { this.tracks.clear(); this.total = 0; }
}

type Drawer = (ctx: CanvasRenderingContext2D, t: Track, now: number, life: number) => void;

const age = (born: number, now: number, life: number) => Math.min(1, Math.max(0, (now - born) / life));

const DRAW: Record<TrailCode, Drawer> = {
  /** 지나온 자리에 원 모양 그림자가 흐려지며 작아진다 */
  afterimage(ctx, t, now, life) {
    ctx.fillStyle = t.color;
    for (const p of t.path) {
      const a = age(p.t, now, life);
      ctx.globalAlpha = 0.3 * (1 - a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.95 - 0.25 * a), 0, Math.PI * 2); ctx.fill();
    }
  },
  /** 네 갈래 별이 반짝이며(깜빡임) 사라진다 */
  sparkle(ctx, t, now) {
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const twinkle = 0.6 + 0.4 * Math.sin((now - p.born) / 60 + p.rot * 3);
      ctx.globalAlpha = (1 - a) * twinkle;
      ctx.fillStyle = `hsl(${p.hue}, 100%, ${75 + 20 * (1 - a)}%)`;
      const s = p.size * (1 - 0.4 * a);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 === 0 ? s : s * 0.3, th = (i * Math.PI) / 4;
        if (i === 0) ctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr); else ctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  },
  /** 노랑 → 주황 → 빨강으로 식으며 작아지는 불티. 겹치면 밝아지게 더한다 */
  flame(ctx, t, now) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      ctx.globalAlpha = 0.75 * (1 - a);
      ctx.fillStyle = `hsl(${p.hue * (1 - a * 0.9)}, 100%, ${60 - 15 * a}%)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - 0.7 * a), 0, Math.PI * 2); ctx.fill();
    }
  },
  /** 떠오르며 흔들리는 물방울. 끝에 살짝 커지며 톡 터진다 */
  bubble(ctx, t, now) {
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const pop = a > 0.85 ? (a - 0.85) / 0.15 : 0;
      const x = p.x + Math.sin(p.rot) * p.size * 0.6;
      const s = p.size * (1 + pop * 0.6);
      ctx.globalAlpha = 0.8 * (1 - pop);
      ctx.strokeStyle = 'rgba(200,240,255,0.95)';
      ctx.fillStyle = 'rgba(160,220,255,0.18)';
      ctx.lineWidth = Math.max(1, s * 0.16);
      ctx.beginPath(); ctx.arc(x, p.y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(x - s * 0.35, p.y - s * 0.35, s * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  },
  /** 지나온 길을 따라 색이 흐르는 띠. 꼬리로 갈수록 가늘고 옅다 */
  rainbow(ctx, t, now, life) {
    const pts = t.path;
    if (pts.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const a = age(p1.t, now, life);
      ctx.globalAlpha = 0.6 * (1 - a);
      ctx.strokeStyle = `hsl(${(p1.t / 4) % 360}, 90%, 62%)`;
      ctx.lineWidth = p1.r * 0.7 * (1 - a * 0.8);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
  },
  /** 좌우로 번갈아 찍히는 작은 발자국(발바닥 + 발가락 셋) */
  footprint(ctx, t, now) {
    ctx.fillStyle = 'rgba(10,20,15,0.55)';
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      ctx.globalAlpha = a < 0.1 ? a / 0.1 : 1 - (a - 0.1) / 0.9;
      const s = p.size;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s, 0, 0, Math.PI * 2); ctx.fill();
      for (const tx of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.arc(tx * s, -s * 1.35, s * 0.28, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  },
  /** 팔랑이며(돌며 납작해졌다 펴지며) 흩날리는 분홍 꽃잎 */
  petal(ctx, t, now) {
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      ctx.globalAlpha = 0.9 * (1 - a * a);
      ctx.fillStyle = `hsl(${p.hue}, 85%, ${80 - 8 * a}%)`;
      const flip = 0.35 + 0.65 * Math.abs(Math.cos((now - p.born) / 180 + p.rot));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * flip, p.size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};
