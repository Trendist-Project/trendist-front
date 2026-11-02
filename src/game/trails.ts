/**
 * 이동 효과(4.23): 움직이는 원 뒤에 남는 잔상·입자. 서버는 효과 코드만 알려 주고 그림은 여기서 그린다.
 * 입자는 움직인 거리마다 만든다(멈춰 있으면 생기지 않는다). 간격은 반지름에 비례하되, 큰 원도 움직이는 동안
 * 초당 최소 개수(rate)는 나오도록 간격을 줄인다. 크기·흩날리는 속도도 반지름에 맞춰 키워서, 큰 원의 효과가 작은 원의
 * 효과를 그대로 키운 모습이 되게 한다. 엔티티마다·전체 입자 수에 상한을 둔다(휴대폰 부담).
 * 서버의 자랑하기 카드(TrailPainter.java)가 같은 규칙을 옮겨 쓰므로 수치를 바꾸면 그쪽도 맞춘다.
 */

export const TRAIL_CODES = [
  'afterimage', 'sparkle', 'flame', 'bubble', 'rainbow', 'footprint', 'petal',
  'heart', 'note', 'bolt', 'smoke', 'snow',
] as const;
export type TrailCode = (typeof TRAIL_CODES)[number];

interface Particle { x: number; y: number; vx: number; vy: number; size: number; born: number; life: number; rot: number; vr: number; hue: number }
interface PathPoint { x: number; y: number; r: number; t: number; life: number }
interface Track {
  code: TrailCode; color: string;
  parts: Particle[]; path: PathPoint[];
  lastX: number; lastY: number; lastT: number; dist: number; step: number; seen: number;
}

const MAX_PER_TRACK = 120;
const MAX_TOTAL = 1500;
/** 한 프레임에 이보다 멀리 움직였으면 순간 이동(입장·보정)으로 보고 효과를 만들지 않는다 */
const TELEPORT = 400;
/**
 * 효과는 모든 원 아래에 그려서, 원 안에 생긴 입자는 원이 지나갈 때까지 가려진다. 속도는 크기와 관계없이 같아서
 * 큰 원일수록 오래 가려지므로, 입자는 원의 뒤쪽 가장자리 바깥에서 만들고 큰 원일수록 오래 남긴다.
 * 수명 배수 = 1 + 반지름 / 이 값(상한 LIFE_SCALE_MAX). 잔상은 원 중심에 남는 그림자라 더 길게 늘린다
 */
const LIFE_SCALE_R = 150;
const LIFE_SCALE_MAX = 3;
const AFTERIMAGE_SCALE_R = 90;
const AFTERIMAGE_SCALE_MAX = 4.5;
const lifeScale = (r: number, per: number, max: number) => Math.min(max, 1 + r / per);
/** 입자 크기의 기준(작은 원은 이 반지름으로 본다) */
const MIN_SIZE_R = 18;
/**
 * 흩날리는 속도 배수: 입자가 커진 만큼 같은 속도로는 제자리에 멈춘 것처럼 보이므로 키운다.
 * 크기에 정비례하면 큰 원의 입자가 원 자신보다 훨씬 빨리 날아가서 제곱근으로 키운다
 */
const driftScale = (s: number) => Math.sqrt(s / MIN_SIZE_R);

/** 효과별: 입자 간격(반지름 배수, 최소 px), 수명(ms), 움직이는 동안 초당 최소 개수 */
const SPEC: Record<TrailCode, { gap: number; minGap: number; life: number; rate: number }> = {
  afterimage: { gap: 0.45, minGap: 10, life: 380, rate: 0 }, // 그림자는 겹치면 진해지므로 반지름 간격 그대로
  sparkle: { gap: 0.3, minGap: 9, life: 950, rate: 24 },
  flame: { gap: 0.22, minGap: 8, life: 600, rate: 40 },
  bubble: { gap: 0.4, minGap: 12, life: 1300, rate: 12 },
  rainbow: { gap: 0.18, minGap: 6, life: 650, rate: 40 },
  footprint: { gap: 0.6, minGap: 14, life: 1700, rate: 2.5 },
  petal: { gap: 0.35, minGap: 11, life: 1500, rate: 14 },
  heart: { gap: 0.4, minGap: 12, life: 1200, rate: 10 },
  note: { gap: 0.5, minGap: 14, life: 1400, rate: 8 },
  bolt: { gap: 0.25, minGap: 9, life: 260, rate: 18 },
  smoke: { gap: 0.3, minGap: 9, life: 1300, rate: 16 },
  snow: { gap: 0.4, minGap: 12, life: 1600, rate: 10 },
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
      t = { code, color, parts: [], path: [], lastX: x, lastY: y, lastT: now, dist: 0, step: 0, seen: this.frame };
      this.tracks.set(id, t);
    }
    t.color = color; t.seen = this.frame;
    const dx = x - t.lastX, dy = y - t.lastY, moved = Math.hypot(dx, dy);
    const dt = Math.max(0.001, (now - t.lastT) / 1000);
    t.lastT = now;
    if (moved > TELEPORT) { t.lastX = x; t.lastY = y; t.dist = 0; return; }
    if (moved < 0.01) return;
    const gap = trailGap(code, r, moved / dt);
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
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const px = -uy, py = ux; // 가는 방향에 수직
    if (t.code === 'afterimage') {
      // 지나온 중심에 남는 그림자. 큰 원은 자기 몸이 비켜날 때까지 오래 가려지므로 크기에 따라 오래 남긴다
      t.path.push({ x, y, r, t: now, life: SPEC.afterimage.life * lifeScale(r, AFTERIMAGE_SCALE_R, AFTERIMAGE_SCALE_MAX) });
      if (t.path.length > 40) t.path.shift();
      return;
    }
    if (t.code === 'rainbow') {
      // 띠는 원의 뒤쪽 가장자리에서 나온다(중심에서 그리면 원 크기만큼 몸에 가려진다)
      t.path.push({ x: x - ux * r * 0.92, y: y - uy * r * 0.92, r, t: now, life: SPEC.rainbow.life * lifeScale(r, LIFE_SCALE_R, LIFE_SCALE_MAX) });
      if (t.path.length > 90) t.path.shift();
      return;
    }
    const life = SPEC[t.code].life * lifeScale(r, LIFE_SCALE_R, LIFE_SCALE_MAX);
    if (t.parts.length >= MAX_PER_TRACK || this.total >= MAX_TOTAL) return;
    const s = Math.max(r, MIN_SIZE_R);
    const k = driftScale(s);
    const tail = r * 1.05; // 원의 뒤쪽 가장자리 바로 바깥에서 나온다(원 안이면 몸에 가려진다)
    const at = (spread: number, extra = 0) => {
      const side = rnd(-spread, spread) * r;
      return { x: x - ux * (tail + extra) + px * side, y: y - uy * (tail + extra) + py * side };
    };
    let p: Particle;
    switch (t.code) {
      case 'sparkle': {
        const o = at(0.8);
        p = { ...o, vx: rnd(-12, 12) * k, vy: rnd(-12, 12) * k,
          size: s * rnd(0.1, 0.2), born: now, life: life * rnd(0.7, 1.1), rot: rnd(0, Math.PI), vr: rnd(-2, 2), hue: rnd(40, 60) };
        break;
      }
      case 'flame': {
        const o = at(0.45);
        const sp = rnd(30, 80);
        p = { ...o, vx: (-ux * sp + rnd(-15, 15)) * k, vy: (-uy * sp + rnd(-15, 15)) * k,
          size: s * rnd(0.2, 0.34), born: now, life: life * rnd(0.7, 1.1), rot: 0, vr: 0, hue: rnd(20, 45) };
        break;
      }
      case 'bubble': {
        const o = at(0.6);
        p = { ...o, vx: rnd(-6, 6) * k, vy: -rnd(14, 30) * k,
          size: s * rnd(0.1, 0.22), born: now, life: life * rnd(0.75, 1.15), rot: rnd(0, Math.PI * 2), vr: rnd(2, 4), hue: 0 };
        break;
      }
      case 'footprint': {
        t.step ^= 1;
        const side = (t.step ? 1 : -1) * r * 0.32;
        p = { x: x - ux * (tail + s * 0.2) + px * side, y: y - uy * (tail + s * 0.2) + py * side, vx: 0, vy: 0,
          size: s * 0.16, born: now, life, rot: Math.atan2(uy, ux) + Math.PI / 2, vr: 0, hue: 0 };
        break;
      }
      case 'petal': {
        const o = at(0.7);
        p = { ...o, vx: (-ux * rnd(10, 30) + rnd(-12, 12)) * k, vy: (-uy * rnd(10, 30) + rnd(4, 20)) * k,
          size: s * rnd(0.13, 0.2), born: now, life: life * rnd(0.8, 1.1), rot: rnd(0, Math.PI * 2), vr: rnd(-3, 3), hue: rnd(330, 355) };
        break;
      }
      case 'heart': {
        const o = at(0.7);
        p = { ...o, vx: rnd(-8, 8) * k, vy: -rnd(16, 32) * k,
          size: s * rnd(0.12, 0.2), born: now, life: life * rnd(0.8, 1.1), rot: rnd(-0.4, 0.4), vr: 0, hue: rnd(335, 365) };
        break;
      }
      case 'note': {
        const o = at(0.7);
        p = { ...o, vx: -ux * rnd(4, 12) * k, vy: -rnd(14, 26) * k,
          size: s * rnd(0.13, 0.2), born: now, life: life * rnd(0.8, 1.1), rot: rnd(-0.3, 0.3), vr: 0, hue: rnd(0, 360) };
        break;
      }
      case 'bolt': {
        // 뒤쪽 가장자리에서 바깥(뒤)으로 뻗는 짧은 번개. 방향은 뒤쪽 ±60°
        const o = at(0.6, -r * 0.05);
        p = { ...o, vx: 0, vy: 0, size: s * rnd(0.35, 0.6), born: now, life: life * rnd(0.7, 1.2),
          rot: Math.atan2(-uy, -ux) + rnd(-1, 1), vr: 0, hue: Math.random() };
        break;
      }
      case 'smoke': {
        const o = at(0.5);
        p = { ...o, vx: (-ux * rnd(6, 16) + rnd(-6, 6)) * k, vy: (-uy * rnd(6, 16) - rnd(4, 12)) * k,
          size: s * rnd(0.16, 0.28), born: now, life: life * rnd(0.8, 1.15), rot: rnd(0, Math.PI * 2), vr: rnd(-0.6, 0.6), hue: rnd(205, 225) };
        break;
      }
      case 'snow': {
        const o = at(0.8);
        p = { ...o, vx: rnd(-6, 6) * k, vy: rnd(8, 20) * k,
          size: s * rnd(0.1, 0.17), born: now, life: life * rnd(0.8, 1.15), rot: rnd(0, Math.PI), vr: rnd(-1.2, 1.2), hue: rnd(0, Math.PI * 2) };
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
      const before = t.parts.length;
      t.parts = t.parts.filter((p) => now - p.born < p.life);
      this.total -= before - t.parts.length;
      while (t.path.length && now - t.path[0].t > t.path[0].life) t.path.shift();
      if (t.seen !== this.frame && t.parts.length === 0 && t.path.length === 0) { this.tracks.delete(id); continue; }
      for (const p of t.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      ctx.save();
      DRAW[t.code](ctx, t, now);
      ctx.restore();
    }
    this.frame++;
  }

  clear() { this.tracks.clear(); this.total = 0; }
}

/**
 * 입자 간격: 기본은 반지름 비례(작은 원과 같은 모양). 다만 속도는 크기와 관계없이 같아서 큰 원은 반지름 간격으로는
 * 1초에 몇 개 나오지 않아 띄엄띄엄 끊겨 보이므로, 움직이는 동안 초당 rate개는 나오게 간격을 줄인다.
 */
function trailGap(code: TrailCode, r: number, speed: number) {
  const spec = SPEC[code];
  const byRadius = r * spec.gap;
  const byRate = spec.rate > 0 ? speed / spec.rate : Infinity;
  return Math.max(spec.minGap, Math.min(byRadius, byRate));
}

type Drawer = (ctx: CanvasRenderingContext2D, t: Track, now: number) => void;

const age = (born: number, now: number, life: number) => Math.min(1, Math.max(0, (now - born) / life));
/** 생길 때 잠깐 커지며 나타난다(갑자기 튀어나오지 않게). a는 나이 비율 */
const popIn = (a: number) => (a < 0.12 ? 0.4 + 0.6 * (a / 0.12) : 1);

/** 0~1 결정적 난수(번개 모양을 프레임마다 같은 규칙으로 흔든다) */
function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 하트 경로(가운데 (0,0), 폭 약 2s) */
function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.85);
  ctx.bezierCurveTo(-s * 1.15, s * 0.05, -s * 0.85, -s * 0.95, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.85, -s * 0.95, s * 1.15, s * 0.05, 0, s * 0.85);
  ctx.closePath();
}

const DRAW: Record<TrailCode, Drawer> = {
  /** 지나온 자리에 원 모양 그림자가 흐려지며 작아진다. 생길 때는 옅게 시작해 툭 나타나지 않는다 */
  afterimage(ctx, t, now) {
    ctx.fillStyle = t.color;
    for (const p of t.path) {
      const a = age(p.t, now, p.life);
      const fadeIn = a < 0.15 ? a / 0.15 : 1;
      ctx.globalAlpha = 0.3 * (1 - a) * fadeIn;
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
      const s = p.size * (1 + pop * 0.6) * popIn(a);
      ctx.globalAlpha = 0.8 * (1 - pop);
      ctx.strokeStyle = 'rgba(200,240,255,0.95)';
      ctx.fillStyle = 'rgba(160,220,255,0.18)';
      ctx.lineWidth = Math.max(1, s * 0.16);
      ctx.beginPath(); ctx.arc(x, p.y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(x - s * 0.35, p.y - s * 0.35, s * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  },
  /**
   * 지나온 길을 따라 색이 흐르는 띠. 꼬리로 갈수록 가늘고 옅다. 둥근 끝 선을 이어 그리면 이음매마다 반투명이 겹쳐
   * 큰 원(띠가 굵을 때)에서 얼룩이 생기므로, 점마다 양옆 폭을 구해 사다리꼴 조각으로 칠한다
   */
  rainbow(ctx, t, now) {
    const pts = t.path;
    if (pts.length < 2) return;
    const n = pts.length;
    const edges = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const w = (p.r * 0.7 * (1 - age(p.t, now, p.life) * 0.8)) / 2;
      return { lx: p.x - (dy / len) * w, ly: p.y + (dx / len) * w, rx: p.x + (dy / len) * w, ry: p.y - (dx / len) * w };
    });
    for (let i = 1; i < n; i++) {
      const p1 = pts[i], e0 = edges[i - 1], e1 = edges[i];
      const a = age(p1.t, now, p1.life);
      ctx.globalAlpha = 0.6 * (1 - a);
      ctx.fillStyle = `hsl(${(p1.t / 4) % 360}, 90%, 62%)`;
      ctx.beginPath();
      ctx.moveTo(e0.lx, e0.ly); ctx.lineTo(e1.lx, e1.ly); ctx.lineTo(e1.rx, e1.ry); ctx.lineTo(e0.rx, e0.ry);
      ctx.closePath(); ctx.fill();
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
  /** 하트가 콩닥(한 번 커졌다 작아짐) 뛰며 떠올라 옅어진다 */
  heart(ctx, t, now) {
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const beat = 1 + 0.18 * Math.max(0, Math.sin(((now - p.born) / 1000) * Math.PI * 3));
      const s = p.size * popIn(a) * beat;
      ctx.globalAlpha = 0.9 * (1 - a * a);
      ctx.save(); ctx.translate(p.x + Math.sin((now - p.born) / 260) * p.size * 0.4, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = `hsl(${p.hue % 360}, 90%, ${66 + 8 * a}%)`;
      heartPath(ctx, s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(-s * 0.42, -s * 0.28, s * 0.2, s * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
  /** 알록달록 음표(♪·♫)가 좌우로 흔들리며 떠오른다 */
  note(ctx, t, now) {
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const s = p.size * popIn(a);
      ctx.globalAlpha = 0.95 * (1 - a * a);
      const sway = Math.sin((now - p.born) / 230 + p.hue) * p.size * 0.5;
      const col = `hsl(${p.hue}, 80%, 72%)`;
      ctx.save(); ctx.translate(p.x + sway, p.y); ctx.rotate(p.rot + Math.sin((now - p.born) / 300) * 0.15);
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s * 0.16); ctx.lineCap = 'round';
      const double = p.hue > 180; // 반은 ♫(두 음표를 잇는 막대)
      const heads = double ? [-s * 0.55, s * 0.55] : [0];
      for (const hx of heads) {
        ctx.beginPath(); ctx.ellipse(hx - s * 0.18, s * 0.55, s * 0.36, s * 0.26, -0.45, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx + s * 0.14, s * 0.5); ctx.lineTo(hx + s * 0.14, -s * 0.85); ctx.stroke();
      }
      ctx.beginPath();
      if (double) { ctx.moveTo(-s * 0.41, -s * 0.85); ctx.lineTo(s * 0.69, -s * 0.85); ctx.lineWidth = Math.max(1, s * 0.26); }
      else { ctx.moveTo(s * 0.14, -s * 0.85); ctx.quadraticCurveTo(s * 0.7, -s * 0.5, s * 0.5, -s * 0.05); }
      ctx.stroke();
      ctx.restore();
    }
  },
  /** 뒤쪽 가장자리에서 튀는 짧은 번개. 모양이 0.05초마다 바뀌며 지직거리고, 겹치면 밝아진다 */
  bolt(ctx, t, now) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const seed = p.hue * 1000 + Math.floor((now - p.born) / 50);
      const segs = 5, len = p.size * (0.6 + 0.4 * (1 - a));
      const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
      const pts: [number, number][] = [[p.x, p.y]];
      for (let i = 1; i <= segs; i++) {
        const along = (len * i) / segs, off = (hash(seed + i) - 0.5) * p.size * 0.45 * (i < segs ? 1 : 0.3);
        pts.push([p.x + cos * along - sin * off, p.y + sin * along + cos * off]);
      }
      const flicker = 0.55 + 0.45 * hash(seed + 99);
      for (const [w, col, al] of [[0.22, 'rgba(90,200,255,1)', 0.35], [0.07, 'rgba(235,250,255,1)', 1]] as const) {
        ctx.globalAlpha = al * (1 - a) * flicker;
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, p.size * w);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
  },
  /** 뭉게뭉게 퍼지며 옅어지는 연기 */
  smoke(ctx, t, now) {
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const s = p.size * (0.6 + 1.3 * a);
      ctx.globalAlpha = 0.32 * (1 - a) * (a < 0.1 ? a / 0.1 : 1);
      ctx.fillStyle = `hsl(${p.hue}, 12%, ${78 - 12 * a}%)`;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.arc(s * 0.6, -s * 0.2, s * 0.62, 0, Math.PI * 2);
      ctx.arc(-s * 0.55, -s * 0.15, s * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  /** 여섯 갈래 눈송이가 천천히 돌며 흩날려 내린다 */
  snow(ctx, t, now) {
    ctx.lineCap = 'round';
    for (const p of t.parts) {
      const a = age(p.born, now, p.life);
      const s = p.size * popIn(a);
      ctx.globalAlpha = 0.95 * (1 - a * a);
      ctx.strokeStyle = 'rgba(235,246,255,1)'; ctx.lineWidth = Math.max(1, s * 0.14);
      ctx.save(); ctx.translate(p.x + Math.sin((now - p.born) / 400 + p.hue) * p.size * 0.6, p.y); ctx.rotate(p.rot);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const th = (i * Math.PI) / 3, c = Math.cos(th), sn = Math.sin(th);
        ctx.moveTo(0, 0); ctx.lineTo(c * s, sn * s);
        // 가지 끝 쪽의 작은 V
        const bx = c * s * 0.6, by = sn * s * 0.6;
        for (const d of [-0.6, 0.6]) {
          ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(th + d) * s * 0.3, by + Math.sin(th + d) * s * 0.3);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  },
};
