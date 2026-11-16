import { newSeed, seeded, type PosFn } from './common';

/**
 * 원에 걸리는 "오라형" 스킬의 연출(4.33): 속박·공격 증폭·피해 감소·침묵·광폭화·혼란·보호막. 서버에 스킬이 생기면 같은 신호로 바로 쓰이도록 먼저 만든 그림이다(판정은 서버가 한다).
 * 독·슬로우 같은 상태(statuses.ts)와 같이 "어느 원에, 언제부터 언제까지, 얼마나(v)"를 한 곳(by)에 들고, 그리는 모양만 종류마다 다르다.
 *  - 속박(root) 땅에 쇠못 넷이 박히고 쇠사슬 네 줄이 팽팽하게 원을 당기며, 원 둘레에 쇠 족쇄 고리가 채워진다(한자리에 묶어 둔 느낌).
 *  - 공격 증폭(amplify) 붉은 화살표 하나가 오른쪽 위 테두리에서 위아래로 움직인다(머리 위 수치는 없다). 버프라 10초 동안 이어지고 다른 스킬과 함께 걸려 있어도 그냥 위로 겹쳐 그려진다.
 *  - 피해 감소(fortify) 남색 방패 하나가 왼쪽 위 테두리에서 위아래로 움직인다(머리 위 수치는 없다).
 *  - 침묵(silence)    발밑에 붉은 봉인진이 새겨지고, 머리 위 스킬 칸(번개)에 자물쇠가 채워져 덜컹거리며, 쓰려던 번개가 불발로 튀어 꺼진다.
 *  - 광폭화(berserk)  검붉은 연기와 붉은 충격파 고리. v는 잃은 체력 비율(0~1)이라 클수록 연기가 많고 충격파가 잦다(머리 위 글자·마크는 없다).
 *  - 혼란(confuse)    분홍 나선과 반대로 도는 물음표·화살표(조작이 반대로 먹는다).
 *  - 보호막(barrier)  육각 격자가 비치는 청록 구체. v는 남은 흡수량 비율. 맞으면 파문이 일고 깨지면 조각이 흩어진다.
 */
export type AuraKind = 'root' | 'amplify' | 'fortify' | 'silence' | 'berserk' | 'confuse' | 'barrier';
const KINDS: AuraKind[] = ['root', 'amplify', 'fortify', 'silence', 'berserk', 'confuse', 'barrier'];
/** 정화(cleanse)가 풀어 주는 종류(해로운 효과). 나머지는 내가 건 이로운 효과라 정화로 풀리지 않는다 */
const CLEANSED: AuraKind[] = ['root', 'silence', 'confuse'];
/** 끝난 뒤 표시가 걷히는 데 걸리는 시간(ms) */
const LINGER_MS = 350;

interface Aura { at: number; until: number; v: number; max: number; hitAt: number; seed: number }
interface Shards { e: number; at: number; seed: number }
type Pos = { x: number; y: number; r: number };
interface Paint { e: number; o: Pos; a: Aura; now: number; z: number; fade: number; lift: number }
type Painter = (this: AuraFx, ctx: CanvasRenderingContext2D, p: Paint) => void;

const TAU = Math.PI * 2;

/** 위를 가리키는 화살표(머리+몸통). (x,y)는 가운데, s는 머리 반폭 */
function arrowPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const stemW = s * 0.5, headH = s * 1.1, stemH = s * 1.2, top = y - (headH + stemH) / 2, bot = y + (headH + stemH) / 2;
  ctx.beginPath();
  ctx.moveTo(x, top); ctx.lineTo(x + s, top + headH); ctx.lineTo(x + stemW, top + headH); ctx.lineTo(x + stemW, bot);
  ctx.lineTo(x - stemW, bot); ctx.lineTo(x - stemW, top + headH); ctx.lineTo(x - s, top + headH); ctx.closePath();
}
/** 방패(위가 평평하고 아래가 뾰족한 모양). (x,y)는 가운데, s는 반폭 */
function crestPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 1.05); ctx.quadraticCurveTo(x, y - s * 0.8, x + s, y - s * 1.05);
  ctx.lineTo(x + s, y + s * 0.1); ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.85, x, y + s * 1.3);
  ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.85, x - s, y + s * 0.1); ctx.closePath();
}
/** 번호와 시드로 0~1 값을 결정적으로 뽑는다(프레임마다 같은 입자가 같은 곳에 있게) */
const hash = (i: number, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const SHARD_MS = 650;

export class AuraFx {
  private by: Record<AuraKind, Map<number, Aura>> = Object.fromEntries(KINDS.map((k) => [k, new Map<number, Aura>()])) as Record<AuraKind, Map<number, Aura>>;
  private shards: Shards[] = [];

  constructor(readonly reducedMotion: boolean) {}

  clear() { for (const m of Object.values(this.by)) m.clear(); this.shards = []; }

  /** 원 e에 kind가 걸렸다. ms가 0 이하면 끝 신호(end)가 올 때까지 이어진다(광폭화). v는 종류별 값(위 설명) */
  apply(kind: AuraKind, e: number, now: number, ms: number, v = 1, max = 1) {
    this.by[kind].set(e, { at: now, until: ms > 0 ? now + ms : Infinity, v, max, hitAt: -1e9, seed: newSeed() });
  }

  /** 처음 값(보호막의 처음 쉴드량). 걸려 있지 않으면 1 */
  maxOf(kind: AuraKind, e: number): number { return this.by[kind].get(e)?.max ?? 1; }

  /** 원 e에 kind가 걸려 있는지(끝나 가는 중이어도 아직 남아 있으면 true) */
  has(kind: AuraKind, e: number): boolean { return this.by[kind].has(e); }

  /** 값만 바꾼다(광폭화의 잃은 체력, 보호막의 남은 양). 걸려 있지 않으면 무시 */
  setValue(kind: AuraKind, e: number, v: number) { const a = this.by[kind].get(e); if (a) a.v = Math.max(0, Math.min(1, v)); }

  /** 보호막이 피해를 막았다: 파문을 일으키고 남은 양을 바꾼다 */
  barrierHit(e: number, now: number, v: number) { const a = this.by.barrier.get(e); if (a) { a.hitAt = now; a.v = Math.max(0, Math.min(1, v)); } }

  /** 끝났다: 걷히는 시간 동안 흐려지다가 사라진다. 보호막이 깨져서(broken) 끝났으면 조각이 흩어진다 */
  end(kind: AuraKind, e: number, now: number, broken = false) {
    const a = this.by[kind].get(e);
    if (a) a.until = Math.min(a.until, now);
    if (kind === 'barrier' && broken) { this.shards.push({ e, at: now, seed: newSeed() }); if (this.shards.length > 12) this.shards.shift(); }
  }

  /** 원 e가 정화를 썼다: 해로운 효과 표시를 지운다 */
  cleanse(e: number) { for (const k of CLEANSED) this.by[k].delete(e); }

  /** 화면 기준 최소 크기를 지키는 선 굵기 */
  lw(z: number, o: Pos, k: number, min = 2) { return Math.max(min / z, o.r * k); }

  /**
   * 머리 위 표시를 위로 밀어 올리는 높이. 머리 위에 그림을 띄우는 효과(혼란·침묵)가 한 원에 함께 걸려도 겹치지 않게
   * HEAD_ORDER에서 앞서는 효과가 걸려 있는 개수만큼 한 칸씩 올린다.
   */
  lift(kind: AuraKind, e: number, o: Pos, z: number): number {
    const i = HEAD_ORDER.indexOf(kind);
    let n = 0;
    for (let k = 0; k < i; k++) if (this.by[HEAD_ORDER[k]].has(e)) n += HEAD_SLOTS[HEAD_ORDER[k]] ?? 1;
    return n * Math.max(o.r * 0.62, 24 / z);
  }

  /** 걸린 효과를 모두 그린다(뒤에 그린 것이 위에 보인다) */
  draw(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const kind of DRAW_ORDER) {
      const m = this.by[kind];
      for (const [e, a] of m) {
        if (now >= a.until + LINGER_MS) { m.delete(e); continue; }
        const o = pos(e, now);
        if (!o) continue;
        // 걸릴 때 빠르게 나타나고, 끝나면 부드럽게 걷힌다
        const fade = Math.min(1, (now - a.at) / 160, (a.until + LINGER_MS - now) / LINGER_MS);
        PAINT[kind].call(this, ctx, { e, o, a, now, z, fade: Math.max(0, fade), lift: this.lift(kind, e, o, z) });
      }
    }
    this.drawShards(ctx, now, z, pos);
  }

  /** 머리 위 글자(윤곽선을 둘러 어디서나 읽힌다) */
  label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, edge: string, z: number) {
    ctx.save();
    ctx.font = `900 ${size}px Impact, "Arial Black", "Noto Sans KR", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5 / z, size * 0.2); ctx.strokeStyle = edge; ctx.fillStyle = fill;
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 번개 모양 경로(중심 0,0, 크기 s). fill·stroke는 부른 쪽이 한다 */
  boltPath(ctx: CanvasRenderingContext2D, s: number) {
    const pts: [number, number][] = [[0.28, -1], [-0.5, 0.12], [-0.06, 0.12], [-0.3, 1], [0.5, -0.16], [0.06, -0.16]];
    ctx.beginPath();
    pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x * s, y * s); else ctx.lineTo(x * s, y * s); });
    ctx.closePath();
  }

  /** 불꽃 한 송이(물방울 모양): 중심 (x, y), 크기 s, 그라데이션으로 바깥 → 속 */
  flame(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, outer: string, inner: string) {
    const path = (k: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.5 * k);
      ctx.bezierCurveTo(x + s * 0.95 * k, y - s * 0.5 * k, x + s * 0.8 * k, y + s * 0.6 * k, x, y + s * 0.7 * k);
      ctx.bezierCurveTo(x - s * 0.8 * k, y + s * 0.6 * k, x - s * 0.95 * k, y - s * 0.5 * k, x, y - s * 1.5 * k);
      ctx.closePath();
    };
    ctx.fillStyle = outer; path(1); ctx.fill();
    ctx.fillStyle = inner; path(0.55); ctx.fill();
  }

  /** 원 둘레에서 위로 타오르는 불꽃들(공격 증폭·광폭화 공통). n송이, 크기 배율 k */
  glowDisc(ctx: CanvasRenderingContext2D, o: Pos, rgb: string, a: number, k: number) {
    const g = ctx.createRadialGradient(o.x, o.y, o.r * 0.5, o.x, o.y, o.r * k);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.7, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * k, 0, TAU); ctx.fill();
  }

  flames(ctx: CanvasRenderingContext2D, o: Pos, e: number, now: number, z: number, n: number, k: number, outer: string, inner: string, speed: number) {
    const base = Math.max(o.r * 0.2, 7 / z) * k;
    for (let i = 0; i < n; i++) {
      const ph = this.reducedMotion ? 0.35 : ((now / speed) + i / n + (i % 3) * 0.13) % 1;
      const ang = (i / n) * TAU + e * 0.7 + Math.sin(i * 12.9898) * 0.4;
      const x = o.x + Math.cos(ang) * o.r * 0.98, y = o.y + Math.sin(ang) * o.r * 0.98 - ph * o.r * 0.7;
      const s = base * (1 - ph) * (0.7 + 0.5 * ((i * 7) % 5) / 5);
      if (s > 0.5 / z) this.flame(ctx, x, y, s, outer, inner);
    }
  }

  /** 보호막이 깨졌다: 육각 조각이 사방으로 튀며 돌고 사라지고, 청록 충격 고리가 퍼진다 */
  private drawShards(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.shards = this.shards.filter((s) => now - s.at < SHARD_MS);
    for (const s of this.shards) {
      const o = pos(s.e, now);
      if (!o) continue;
      const t = (now - s.at) / SHARD_MS, ease = 1 - (1 - t) ** 3, rnd = seeded(s.seed), spread = this.reducedMotion ? 0.35 : 1;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = 'rgba(160,240,255,0.9)'; ctx.lineWidth = Math.max(3 / z, o.r * 0.08) * (1 - t);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.15 + ease * 0.9), 0, TAU); ctx.stroke();
      ctx.lineJoin = 'round';
      for (let i = 0; i < 11; i++) {
        const ang = rnd() * TAU, far = 0.3 + rnd() * 0.9, size = o.r * (0.1 + rnd() * 0.13), spin = (rnd() - 0.5) * 7 * t * spread;
        const d = o.r * (1.1 + far * ease * spread), cx = o.x + Math.cos(ang) * d, cy = o.y + Math.sin(ang) * d + t * t * o.r * 0.5 * spread;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) { const a = spin + (j * TAU) / 6; ctx.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size); }
        ctx.closePath();
        ctx.fillStyle = 'rgba(88,230,255,0.35)'; ctx.fill();
        ctx.strokeStyle = 'rgba(210,250,255,0.95)'; ctx.lineWidth = Math.max(1.6 / z, size * 0.22); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** 남은 시간 호(위에서 시계 방향으로 줄어든다). 끝이 정해지지 않은 효과(until=∞)는 그리지 않는다 */
  timeArc(ctx: CanvasRenderingContext2D, o: Pos, a: Aura, now: number, z: number, color: string, radius: number) {
    if (!Number.isFinite(a.until)) return;
    const total = Math.max(1, a.until - a.at), left = Math.max(0, a.until - now);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = this.lw(z, o, 0.06, 2.5); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(o.x, o.y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * (left / total)); ctx.stroke();
    ctx.restore();
  }
}

/** 머리 위에 글자·그림을 띄우는 효과의 쌓는 순서(앞쪽이 아래, 뒤쪽이 위로 올라간다) */
const HEAD_ORDER: AuraKind[] = ['confuse', 'silence'];
/** 효과 하나가 머리 위에서 차지하는 칸 수(침묵의 자물쇠 칸은 키가 커서 2.5칸) */
const HEAD_SLOTS: Record<string, number> = { confuse: 1, silence: 2.5 };

/** 그리는 순서(보호막이 가장 안쪽, 머리 위 표시가 많은 것이 위) */
const DRAW_ORDER: AuraKind[] = ['barrier', 'fortify', 'root', 'amplify', 'berserk', 'confuse', 'silence'];

const PAINT: Record<AuraKind, Painter> = {
  /**
   * 속박: 땅에 쇠못 네 개가 쾅쾅 박히고(0.3초), 못에서 쇠사슬 네 줄이 팽팽하게 원을 당기며 원 둘레에 쇠 족쇄 고리가 채워진다.
   * 한자리에 묶어 둔 느낌이 나도록 사슬은 늘 팽팽하고, 벗어나려고 발버둥치듯 가늘게 떨린다. 박힐 때 흙먼지와 금이 인다. 둘레에는 남은 시간 호가 있다.
   */
  root(ctx, { e, o, a, now, z, fade }) {
    const grow = Math.min(1, (now - a.at) / 300), g = 1 - (1 - grow) ** 3, R = o.r, still = this.reducedMotion;
    const tremble = still ? 0 : Math.sin(now / 38 + e) * R * 0.012 * (1 + Math.sin(now / 410));
    const stakeD = R * 2.05, dark = '#1f2733', steel = '#b9c4d4', steelHi = '#eef3fa';
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 못 둘레의 갈라진 땅
    for (let k = 0; k < 4; k++) {
      const ang = Math.PI / 4 + (k * Math.PI) / 2, sx = o.x + Math.cos(ang) * stakeD, sy = o.y + Math.sin(ang) * stakeD;
      if (grow < 0.55) continue;
      ctx.strokeStyle = 'rgba(30,18,6,0.65)'; ctx.lineWidth = this.lw(z, o, 0.025, 1.4);
      for (let c = 0; c < 5; c++) { const ca = (c * TAU) / 5 + k, cl = R * (0.22 + 0.1 * (c % 2)); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(ca) * cl, sy + Math.sin(ca) * cl); ctx.stroke(); }
    }
    // 쇠사슬: 못에서 원 가장자리까지. 마디가 번갈아 눕고 서며, 팽팽하게 떨린다
    for (let k = 0; k < 4; k++) {
      const ang = Math.PI / 4 + (k * Math.PI) / 2, c = Math.cos(ang), s = Math.sin(ang);
      const x0 = o.x + c * R * 1.0, y0 = o.y + s * R * 1.0, x1 = o.x + c * stakeD * g, y1 = o.y + s * stakeD * g;
      const links = 8, len = Math.hypot(x1 - x0, y1 - y0), step = len / links, ll = Math.max(step * 0.95, 3 / z), lw = Math.max(R * 0.1, 3 / z);
      for (let i = 0; i < links; i++) {
        const t = (i + 0.5) / links, wob = tremble * Math.sin(t * Math.PI) * (k % 2 ? 1 : -1);
        const mx = x0 + (x1 - x0) * t - s * wob, my = y0 + (y1 - y0) * t + c * wob;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
        if (i % 2 === 0) { // 누운 마디(타원 고리)
          ctx.strokeStyle = dark; ctx.lineWidth = lw + 2 / z; ctx.beginPath(); ctx.ellipse(0, 0, ll * 0.62, lw * 0.9, 0, 0, TAU); ctx.stroke();
          ctx.strokeStyle = steel; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(0, 0, ll * 0.62, lw * 0.9, 0, 0, TAU); ctx.stroke();
          ctx.strokeStyle = steelHi; ctx.lineWidth = Math.max(lw * 0.3, 0.8 / z); ctx.beginPath(); ctx.ellipse(0, -lw * 0.2, ll * 0.5, lw * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        } else { // 선 마디(옆에서 본 모양: 짧은 막대)
          ctx.strokeStyle = dark; ctx.lineWidth = lw * 0.8 + 2 / z; ctx.beginPath(); ctx.moveTo(-ll * 0.5, 0); ctx.lineTo(ll * 0.5, 0); ctx.stroke();
          ctx.strokeStyle = '#8f9bb0'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(-ll * 0.5, 0); ctx.lineTo(ll * 0.5, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }
    // 쇠못: 박히는 순간 위에서 내리꽂히듯 커졌다 제 크기가 된다
    for (let k = 0; k < 4; k++) {
      const ang = Math.PI / 4 + (k * Math.PI) / 2, sx = o.x + Math.cos(ang) * stakeD, sy = o.y + Math.sin(ang) * stakeD, drop = (1 - g) * R * 0.7, sr = Math.max(R * 0.2, 6.5 / z) * (1 + (1 - g) * 0.6);
      ctx.globalAlpha = fade * Math.min(1, grow * 3);
      ctx.fillStyle = '#7a4f1e'; ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.8 / z, sr * 0.22);
      ctx.beginPath(); ctx.arc(sx, sy - drop, sr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = steel; ctx.lineWidth = Math.max(1.4 / z, sr * 0.28); ctx.beginPath(); ctx.arc(sx, sy - drop, sr * 0.45, 0, TAU); ctx.stroke(); // 사슬이 걸린 고리 눈
      ctx.fillStyle = 'rgba(232,197,138,0.7)'; ctx.beginPath(); ctx.arc(sx - sr * 0.3, sy - drop - sr * 0.3, sr * 0.2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = fade;
    // 원 둘레의 쇠 족쇄 고리
    const rr = R * 1.02;
    ctx.strokeStyle = dark; ctx.lineWidth = this.lw(z, o, 0.15, 5) + 2 / z; ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = steel; ctx.lineWidth = this.lw(z, o, 0.15, 5); ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = steelHi; ctx.lineWidth = this.lw(z, o, 0.04, 1.4); ctx.beginPath(); ctx.arc(o.x, o.y, rr - R * 0.03, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
    // 못이 박힐 때 흙먼지
    if (!still && now - a.at < 600) {
      const t = (now - a.at) / 600;
      ctx.fillStyle = `rgba(160,120,70,${0.5 * (1 - t)})`;
      for (let k = 0; k < 4; k++) {
        const ang = Math.PI / 4 + (k * Math.PI) / 2, sx = o.x + Math.cos(ang) * stakeD, sy = o.y + Math.sin(ang) * stakeD;
        for (let i = 0; i < 4; i++) { const pa = (i * TAU) / 4 + k, d = R * 0.2 + t * R * 0.5; ctx.beginPath(); ctx.arc(sx + Math.cos(pa) * d, sy + Math.sin(pa) * d, Math.max(2 / z, R * 0.06) * (1 - t * 0.5), 0, TAU); ctx.fill(); }
      }
    }
    ctx.restore();
    this.timeArc(ctx, o, a, now, z, `rgba(200,210,225,${0.9 * fade})`, R * 1.16);
  },

  /** 공격 증폭: 원의 오른쪽 위 테두리에 걸친 붉은 화살표 하나가 위아래로 살짝씩 계속 움직인다(머리 위 수치는 없다) */
  amplify(ctx, { o, a, now, z, fade }) {
    ctx.save(); ctx.globalAlpha = fade;
    const gl = ctx.createRadialGradient(o.x, o.y, o.r * 0.5, o.x, o.y, o.r * 1.3);
    gl.addColorStop(0, 'rgba(255,47,69,0)'); gl.addColorStop(0.7, 'rgba(255,47,69,0.16)'); gl.addColorStop(1, 'rgba(255,47,69,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,70,80,0.55)'; ctx.lineWidth = this.lw(z, o, 0.05, 2.4); ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.04, 0, TAU); ctx.stroke();
    const bob = this.reducedMotion ? 0 : Math.sin(now / 320) * o.r * 0.14, ang = -Math.PI / 4, s = Math.max(o.r * 0.3, 10 / z);
    const x = o.x + Math.cos(ang) * o.r, y = o.y + Math.sin(ang) * o.r + bob;
    arrowPath(ctx, x, y, s);
    const g = ctx.createLinearGradient(x, y - s * 1.2, x, y + s * 1.2); g.addColorStop(0, '#ff6a6a'); g.addColorStop(1, '#d1202f');
    ctx.shadowColor = 'rgba(255,40,60,0.8)'; ctx.shadowBlur = 8; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffe1d6'; ctx.lineWidth = Math.max(s * 0.14, 1.2 / z); ctx.stroke();
    ctx.restore();
    this.timeArc(ctx, o, a, now, z, `rgba(255,120,110,${0.9 * fade})`, o.r * 1.16);
  },


  /** 피해 감소: 원의 왼쪽 위 테두리에 걸친 남색 방패 하나(금빛 보석)가 위아래로 살짝씩 계속 움직인다. 공격 증폭의 화살표(오른쪽 위)와 겹치지 않는다 */
  fortify(ctx, { o, a, now, z, fade }) {
    ctx.save(); ctx.globalAlpha = fade;
    const gl = ctx.createRadialGradient(o.x, o.y, o.r * 0.5, o.x, o.y, o.r * 1.3);
    gl.addColorStop(0, 'rgba(120,140,255,0)'); gl.addColorStop(0.7, 'rgba(120,140,255,0.18)'); gl.addColorStop(1, 'rgba(120,140,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(130,150,255,0.55)'; ctx.lineWidth = this.lw(z, o, 0.05, 2.4); ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.04, 0, TAU); ctx.stroke();
    const bob = this.reducedMotion ? 0 : Math.sin(now / 340 + 1.6) * o.r * 0.14, ang = (-3 * Math.PI) / 4, s = Math.max(o.r * 0.27, 9.5 / z);
    const x = o.x + Math.cos(ang) * o.r, y = o.y + Math.sin(ang) * o.r + bob;
    crestPath(ctx, x, y, s);
    const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s); g.addColorStop(0, '#6f86ff'); g.addColorStop(1, '#2b2f9e');
    ctx.shadowColor = 'rgba(100,120,255,0.85)'; ctx.shadowBlur = 8; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#dfe5ff'; ctx.lineWidth = Math.max(s * 0.14, 1.2 / z); ctx.stroke();
    // 가운데 금빛 보석
    const gs = s * 0.38; ctx.beginPath(); ctx.moveTo(x, y - gs * 1.2); ctx.lineTo(x + gs, y - gs * 0.2); ctx.lineTo(x, y + gs * 1.1); ctx.lineTo(x - gs, y - gs * 0.2); ctx.closePath();
    ctx.fillStyle = '#ffd45a'; ctx.fill(); ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = Math.max(s * 0.07, 0.8 / z); ctx.stroke();
    ctx.restore();
    this.timeArc(ctx, o, a, now, z, `rgba(140,160,255,${0.9 * fade})`, o.r * 1.16);
  },


  /**
   * 침묵: "스킬이 봉인됐다"는 느낌. ① 몸 둘레에 붉은 마법 봉인진(안팎 두 고리가 서로 반대로 돌고 룬 눈금과 가로지른 X)이 쾅 하고 새겨진다.
   * ② 머리 위에 스킬 칸(번개가 든 둥근 사각형)이 뜨고 자물쇠가 채워진다. 칸은 주기적으로 덜컹 흔들리며 불꽃이 튄다.
   * ③ 쓰려던 회색 번개 조각이 몸에서 튀어나와 붉게 깜빡이다 꺼진다(불발). 움직이는 것은 막지 않으니 둘레 효과는 가볍게 둔다.
   */
  silence(ctx, { e, o, a, now, z, fade, lift }) {
    const slam = Math.min(1, (now - a.at) / 240), sEase = 1 - (1 - slam) ** 3, sc = this.reducedMotion ? 1 : 1.7 - 0.7 * sEase;
    const spin = this.reducedMotion ? 0 : now / 1600, pulse = this.reducedMotion ? 0.7 : 0.7 + 0.3 * Math.sin(now / 200);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // ① 봉인진
    const R1 = o.r * 1.32 * sc, R2 = o.r * 1.12 * sc;
    ctx.strokeStyle = `rgba(255,70,90,${0.55 + 0.3 * pulse})`; ctx.lineWidth = this.lw(z, o, 0.05, 2.4);
    ctx.beginPath(); ctx.arc(o.x, o.y, R1, 0, TAU); ctx.stroke();
    ctx.setLineDash([o.r * 0.22, o.r * 0.14]); ctx.strokeStyle = 'rgba(205,213,228,0.8)'; ctx.lineWidth = this.lw(z, o, 0.04, 2);
    ctx.lineDashOffset = this.reducedMotion ? 0 : now / 50;
    ctx.beginPath(); ctx.arc(o.x, o.y, R2, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(255,90,110,${0.7 * pulse})`; ctx.lineWidth = this.lw(z, o, 0.03, 1.6);
    for (let i = 0; i < 12; i++) { // 룬 눈금(바깥 고리를 따라 돈다)
      const t = spin + (i * TAU) / 12, r0 = R1 - o.r * 0.06, r1 = R1 + o.r * (i % 3 === 0 ? 0.14 : 0.07);
      ctx.beginPath(); ctx.moveTo(o.x + Math.cos(t) * r0, o.y + Math.sin(t) * r0); ctx.lineTo(o.x + Math.cos(t) * r1, o.y + Math.sin(t) * r1); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,70,90,${0.35 + 0.2 * pulse})`; ctx.lineWidth = this.lw(z, o, 0.035, 1.8); // 봉인의 X(진 모양을 따라 천천히 돈다)
    for (let k = 0; k < 2; k++) { const t = -spin * 0.6 + Math.PI / 4 + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(o.x + Math.cos(t) * R2, o.y + Math.sin(t) * R2); ctx.lineTo(o.x - Math.cos(t) * R2, o.y - Math.sin(t) * R2); ctx.stroke(); }
    if (slam < 1 && !this.reducedMotion) { // 새겨지는 순간의 충격 고리
      ctx.strokeStyle = `rgba(255,200,205,${0.9 * (1 - slam)})`; ctx.lineWidth = this.lw(z, o, 0.08, 3) * (1 - slam);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.3 + 0.6 * sEase), 0, TAU); ctx.stroke();
    }
    // ③ 불발되는 번개 조각
    if (!this.reducedMotion) {
      for (let i = 0; i < 3; i++) {
        const ph = ((now / 1300) + i / 3) % 1, ang = -Math.PI / 2 + (i - 1) * 0.9 + Math.sin(e + i) * 0.2, d = o.r * (0.7 + ph * 0.75);
        const bx = o.x + Math.cos(ang) * d, by = o.y + Math.sin(ang) * d, bs = Math.max(o.r * 0.2, 7 / z) * (1 - ph * 0.4);
        ctx.save(); ctx.translate(bx, by); ctx.rotate((ph * 2 + i) * 0.5);
        ctx.globalAlpha = fade * (1 - ph) * (ph > 0.55 ? 0.6 + 0.4 * Math.sin(now / 35) : 1);
        this.boltPath(ctx, bs);
        ctx.fillStyle = ph > 0.55 ? '#ff5a6e' : '#aab3c6'; ctx.fill(); ctx.strokeStyle = '#1d222c'; ctx.lineWidth = Math.max(1.2 / z, bs * 0.16); ctx.stroke();
        ctx.restore();
      }
    }
    // ② 머리 위 스킬 칸 + 자물쇠
    const bs = Math.max(o.r * 0.95, 34 / z), bx = o.x, by = o.y - o.r * 1.45 - bs * 0.5 - lift;
    const rattle = this.reducedMotion ? 0 : Math.max(0, 1 - ((now + e * 211) % 1500) / 280) * Math.sin(now / 38) * 0.16;
    ctx.globalAlpha = fade;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(rattle);
    const hw = bs / 2, rad = bs * 0.2;
    ctx.beginPath(); ctx.moveTo(-hw + rad, -hw); ctx.arcTo(hw, -hw, hw, hw, rad); ctx.arcTo(hw, hw, -hw, hw, rad); ctx.arcTo(-hw, hw, -hw, -hw, rad); ctx.arcTo(-hw, -hw, hw, -hw, rad); ctx.closePath();
    ctx.fillStyle = '#242a3a'; ctx.fill(); ctx.strokeStyle = '#cdd5e4'; ctx.lineWidth = Math.max(2.2 / z, bs * 0.07); ctx.stroke();
    this.boltPath(ctx, bs * 0.34); ctx.fillStyle = '#6b7488'; ctx.fill(); ctx.strokeStyle = '#11151f'; ctx.lineWidth = Math.max(1.4 / z, bs * 0.04); ctx.stroke();
    // 자물쇠(칸의 오른쪽 아래에 걸린다)
    const lw = bs * 0.5, lx = hw * 0.55, ly = hw * 0.5;
    ctx.strokeStyle = '#11151f'; ctx.lineWidth = Math.max(3.4 / z, lw * 0.26);
    ctx.beginPath(); ctx.arc(lx, ly - lw * 0.12, lw * 0.3, Math.PI, 0); ctx.stroke(); // 걸쇠 윤곽
    ctx.strokeStyle = '#d8dfec'; ctx.lineWidth = Math.max(2 / z, lw * 0.14);
    ctx.beginPath(); ctx.arc(lx, ly - lw * 0.12, lw * 0.3, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - lw * 0.5, ly - lw * 0.12); ctx.arcTo(lx - lw * 0.5, ly + lw * 0.5, lx + lw * 0.5, ly + lw * 0.5, lw * 0.12); ctx.arcTo(lx + lw * 0.5, ly + lw * 0.5, lx + lw * 0.5, ly - lw * 0.12, lw * 0.12); ctx.arcTo(lx + lw * 0.5, ly - lw * 0.12, lx - lw * 0.5, ly - lw * 0.12, lw * 0.12); ctx.arcTo(lx - lw * 0.5, ly - lw * 0.12, lx - lw * 0.5, ly + lw * 0.5, lw * 0.12); ctx.closePath();
    ctx.fillStyle = '#e5384d'; ctx.fill(); ctx.strokeStyle = '#11151f'; ctx.lineWidth = Math.max(1.8 / z, lw * 0.1); ctx.stroke();
    ctx.fillStyle = '#11151f'; ctx.beginPath(); ctx.arc(lx, ly + lw * 0.12, lw * 0.09, 0, TAU); ctx.fill(); ctx.fillRect(lx - lw * 0.04, ly + lw * 0.12, lw * 0.08, lw * 0.2);
    // 칸 위의 붉은 금지 사선(덜컹거릴 때 번쩍)
    const flash = this.reducedMotion ? 0 : Math.max(0, 1 - ((now + e * 211) % 1500) / 280);
    ctx.strokeStyle = `rgba(255,${90 + Math.round(flash * 110)},${105 + Math.round(flash * 90)},0.95)`; ctx.lineWidth = Math.max(2.4 / z, bs * 0.075);
    ctx.beginPath(); ctx.moveTo(-hw * 0.78, -hw * 0.78); ctx.lineTo(hw * 0.4, hw * 0.4); ctx.stroke();
    ctx.restore();
    if (flash > 0.3) { // 덜컹거릴 때 튀는 불꽃
      ctx.fillStyle = `rgba(255,190,120,${flash})`;
      for (let i = 0; i < 4; i++) { const t = i * 1.7 + now / 90; ctx.beginPath(); ctx.arc(bx + Math.cos(t) * bs * 0.62, by + Math.sin(t) * bs * 0.62, Math.max(1.5 / z, bs * 0.045), 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    this.timeArc(ctx, o, a, now, z, `rgba(255,110,125,${0.9 * fade})`, R1 + o.r * 0.18);
  },

  /** 광폭화: 검붉은 연기가 몸에서 피어오르고 붉은 충격파 고리가 주기적으로 퍼진다. v(잃은 체력 비율)가 클수록 연기가 많고 충격파가 잦다. 머리 위 글자는 없고 시간 호도 없다 */
  berserk(ctx, { e, o, a, now, z, fade }) {
    const v = a.v, n = 9 + Math.round(6 * v);
    ctx.save(); ctx.globalAlpha = fade;
    this.glowDisc(ctx, o, '120,0,10', 0.3 + 0.3 * v, 1.35);
    for (let i = 0; i < n; i++) {
      const ph = this.reducedMotion ? 0.4 : ((now / 1300) + i / n) % 1, ang = hash(i + e) * TAU, rad = o.r * (0.5 + 0.6 * hash(i, 4));
      const x = o.x + Math.cos(ang) * rad * 0.8, y = o.y + Math.sin(ang) * rad * 0.4 - ph * o.r * 1.5, rr = o.r * (0.22 + 0.4 * ph);
      ctx.globalAlpha = fade * 0.5 * Math.sin(ph * Math.PI);
      ctx.fillStyle = i % 3 ? '#2a0408' : '#5a0a12'; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }
    const per = 900 - 350 * v;
    for (const off of [0, 0.5]) {
      const ph = this.reducedMotion ? 0.5 : ((now / per) + off) % 1;
      ctx.globalAlpha = fade * (1 - ph); ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = Math.max(o.r * 0.08 * (1 - ph), 1.4 / z);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.0 + 0.8 * ph), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = fade; ctx.strokeStyle = 'rgba(230,25,35,0.8)'; ctx.lineWidth = this.lw(z, o, 0.07, 3);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.04, 0, TAU); ctx.stroke();
    ctx.restore();
  },

  /**
   * 혼란: 머리 위에 분홍 나선이 빙글 돌고, 물음표가 궤도를 따라 반대 방향으로 돈다. 몸 둘레에는 서로 반대로 도는 화살표 둘이 있어
   * "조작이 뒤집혔다"는 것을 보여 준다. 원 자체도 아주 조금 어지럽게 흔들린다.
   */
  confuse(ctx, { e, o, a, now, z, fade }) {
    const spin = this.reducedMotion ? 0 : now / 500;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = `rgba(255,110,199,${0.55 + (this.reducedMotion ? 0.2 : 0.2 * Math.sin(now / 120))})`; ctx.lineWidth = this.lw(z, o, 0.06, 2.6);
    ctx.setLineDash([o.r * 0.3, o.r * 0.22]); ctx.lineDashOffset = this.reducedMotion ? 0 : now / 40;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // 서로 반대로 도는 화살표 둘
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const dir of [1, -1]) {
      const a0 = spin * dir * 1.4 + (dir > 0 ? 0 : Math.PI), R = o.r * (dir > 0 ? 1.28 : 1.42), sweep = 1.1, s = Math.max(o.r * 0.14, 6 / z);
      ctx.strokeStyle = '#4a1238'; ctx.lineWidth = this.lw(z, o, 0.075, 3.4) + 2 / z;
      ctx.beginPath(); ctx.arc(o.x, o.y, R, a0, a0 + sweep * dir, dir < 0); ctx.stroke();
      ctx.strokeStyle = dir > 0 ? '#ff6ec7' : '#ffb4e4'; ctx.lineWidth = this.lw(z, o, 0.075, 3.4);
      ctx.beginPath(); ctx.arc(o.x, o.y, R, a0, a0 + sweep * dir, dir < 0); ctx.stroke();
      const t = a0 + sweep * dir, hx = o.x + Math.cos(t) * R, hy = o.y + Math.sin(t) * R, tx = -Math.sin(t) * dir, ty = Math.cos(t) * dir; // 진행 방향
      ctx.fillStyle = dir > 0 ? '#ff6ec7' : '#ffb4e4'; ctx.strokeStyle = '#4a1238'; ctx.lineWidth = Math.max(1.4 / z, s * 0.2);
      ctx.beginPath(); ctx.moveTo(hx + tx * s * 1.3, hy + ty * s * 1.3); ctx.lineTo(hx - tx * s * 0.3 + ty * s, hy - ty * s * 0.3 - tx * s); ctx.lineTo(hx - tx * s * 0.3 - ty * s, hy - ty * s * 0.3 + tx * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 머리 위 나선
    const cx = o.x, cy = o.y - o.r * 1.12, sr = Math.max(o.r * 0.42, 15 / z);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const u = i / 40, ang = u * Math.PI * 5 + spin * 2.2, rad = sr * u; ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.6); }
    ctx.strokeStyle = '#4a1238'; ctx.lineWidth = Math.max(3.4 / z, sr * 0.3); ctx.stroke();
    ctx.strokeStyle = '#ff6ec7'; ctx.lineWidth = Math.max(1.8 / z, sr * 0.16); ctx.stroke();
    // 궤도를 도는 물음표 셋
    const qs = Math.max(o.r * 0.42, 15 / z), items = Array.from({ length: 3 }, (_, i) => { const t = -spin * 0.9 + (i * TAU) / 3, rx = Math.max(o.r * 0.9, 18 / z); return { depth: (Math.sin(t) + 1) / 2, x: cx + Math.cos(t) * rx, y: cy - sr * 0.4 + Math.sin(t) * rx * 0.28 }; }).sort((u, v) => u.depth - v.depth);
    for (const it of items) {
      ctx.globalAlpha = fade * (0.5 + 0.5 * it.depth);
      this.label(ctx, '?', it.x, it.y + qs * 0.5, qs * (0.7 + 0.4 * it.depth), '#fff', '#8a1f6a', z);
    }
    ctx.globalAlpha = fade;
    // 어지러운 흔들림 표시(원 둘레 별 반짝임 대신 작은 점)
    ctx.fillStyle = 'rgba(255,200,236,0.8)';
    for (let i = 0; i < 4; i++) { const ph = this.reducedMotion ? 0.4 : ((now / 900) + i / 4) % 1, ang = e + i * 1.7; ctx.beginPath(); ctx.arc(o.x + Math.cos(ang) * o.r * (0.5 + ph * 0.6), o.y + Math.sin(ang) * o.r * (0.5 + ph * 0.6), Math.max(1.6 / z, o.r * 0.05) * (1 - ph), 0, TAU); ctx.fill(); }
    ctx.restore();
    this.timeArc(ctx, o, a, now, z, `rgba(255,150,215,${0.9 * fade})`, o.r * 1.1);
  },

  /**
   * 보호막: 몸 전체를 감싼 청록 구체. 가장자리일수록 진한 유리 같은 면에 육각 격자가 비치고, 흰 반사광이 한 줄기 흐른다.
   * 남은 양(v)이 줄수록 옅어지고 금이 간다. 피해를 막으면 맞은 쪽에서 흰 파문이 퍼지고 테두리가 번쩍인다. 처음에는 작게 시작해 부풀어 오른다.
   */
  barrier(ctx, { o, a, now, z, fade }) {
    const v = a.v, pop = Math.min(1, (now - a.at) / 260), grow = 0.6 + 0.4 * (1 - (1 - pop) ** 3), R = o.r * 1.2 * grow;
    const hit = Math.max(0, 1 - (now - a.hitAt) / 380), wob = this.reducedMotion ? 0 : Math.sin(now / 420) * 0.012;
    ctx.save();
    ctx.globalAlpha = fade;
    const body = ctx.createRadialGradient(o.x, o.y, R * 0.45, o.x, o.y, R);
    body.addColorStop(0, 'rgba(88,230,255,0.02)'); body.addColorStop(0.8, `rgba(88,230,255,${0.1 + 0.16 * v})`); body.addColorStop(1, `rgba(150,245,255,${0.28 + 0.25 * v + 0.3 * hit})`);
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(o.x, o.y, R * (1 + wob), 0, TAU); ctx.fill();
    // 육각 격자(구체 안으로 잘라 낸다)
    ctx.save();
    ctx.beginPath(); ctx.arc(o.x, o.y, R * (1 + wob), 0, TAU); ctx.clip();
    const hs = Math.max(R * 0.32, 12 / z), hh = hs * Math.sqrt(3), drift = this.reducedMotion ? 0 : (now / 40) % hh;
    ctx.strokeStyle = `rgba(200,250,255,${0.18 + 0.3 * v + 0.4 * hit})`; ctx.lineWidth = Math.max(1.2 / z, R * 0.014);
    for (let col = -4; col <= 4; col++) {
      for (let row = -4; row <= 4; row++) {
        const cx = o.x + col * hs * 1.5, cy = o.y + row * hh + (col % 2 ? hh / 2 : 0) + drift * 0.15;
        if (Math.hypot(cx - o.x, cy - o.y) > R + hs) continue;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) { const t = (j * TAU) / 6; ctx.lineTo(cx + Math.cos(t) * hs * 0.98, cy + Math.sin(t) * hs * 0.98); }
        ctx.closePath(); ctx.stroke();
      }
    }
    // 흐르는 빛줄기
    if (!this.reducedMotion) {
      const sx = o.x - R + ((now / 1100) % 1.6) * R * 2 - R * 0.3;
      const sheen = ctx.createLinearGradient(sx - R * 0.25, o.y - R, sx + R * 0.25, o.y + R);
      sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.22)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen; ctx.fillRect(o.x - R, o.y - R, R * 2, R * 2);
    }
    // 맞은 곳에서 퍼지는 파문
    if (hit > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * hit})`; ctx.lineWidth = Math.max(2.5 / z, R * 0.05);
      ctx.beginPath(); ctx.arc(o.x, o.y, R * (1 - 0.85 * hit), 0, TAU); ctx.stroke();
    }
    // 남은 양이 적으면 금
    if (v < 0.4) {
      const rnd = seeded(a.seed); ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - v / 0.4)})`; ctx.lineWidth = Math.max(1.5 / z, R * 0.02); ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ang = rnd() * TAU; let x = o.x + Math.cos(ang) * R, y = o.y + Math.sin(ang) * R;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) { const na = ang + Math.PI + (rnd() - 0.5) * 1.1; x += Math.cos(na) * R * 0.22; y += Math.sin(na) * R * 0.22; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
    // 테두리
    ctx.strokeStyle = `rgba(88,230,255,${0.7 + 0.3 * hit})`; ctx.lineWidth = Math.max(3 / z, R * 0.05) * (1 + 0.6 * hit);
    ctx.beginPath(); ctx.arc(o.x, o.y, R * (1 + wob), 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(2.2 / z, R * 0.03); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(o.x, o.y, R * 0.94, -Math.PI * 0.86, -Math.PI * 0.62); ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x - R * 0.58, o.y - R * 0.62, Math.max(2 / z, R * 0.035), 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    this.timeArc(ctx, o, a, now, z, `rgba(190,248,255,${0.9 * fade})`, R * 1.07);
  },
};
