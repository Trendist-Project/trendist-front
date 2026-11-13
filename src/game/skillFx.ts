import type { SkillFx } from './protocol';
import { drawDamage } from './damageText';

/** 스킬 연출(4.33): 반발·충격파·갈고리·은신·슬로우·스턴·불꽃·흡수 등. 상태와 그리기만 맡고, 판정은 서버(Room)가 한다. 그림은 판정과 같은 크기로 그려 보는 쪽이 피할 수 있게 한다. */

type Pos = { x: number; y: number; r: number };
export type PosFn = (e: number, now: number) => Pos | null;

const SHOCK_FADE_MS = 250;     // 끝까지 퍼진 뒤 사라지는 시간
const HOOK_WAIT_MS = 250;      // 끝까지 뻗은 뒤 서버 결과(hookHit/hookEnd)를 기다리는 최대 시간
const FX_CAP = 24;
const STEALTH_FADE_MS = 550;   // 은신에 들어갈 때 사라지고, 풀릴 때 다시 나타나는 시간(끊긴 것과 구분되게 부드럽게)
const PUFF_MS = 750;           // 은신 시작·끝에 퍼지는 고리와 반짝임

type BoltKind = 'poison' | 'darkness' | 'slow' | 'stun';
type BurstKind = BoltKind | 'flame';
/** 투사체·맞은 자리 고리의 색(꼬리, 몸통, 테두리, 고리). 종류가 늘면 여기에 한 줄 */
const BOLT_STYLE: Record<BurstKind, { tail: string; fill: string; edge: string; ring: string }> = {
  poison: { tail: 'rgba(90,220,90,0.55)', fill: '#4cd964', edge: '#c9ffd0', ring: '90,220,90' },
  darkness: { tail: 'rgba(120,70,200,0.5)', fill: '#14101c', edge: '#9b6cff', ring: '155,108,255' },
  slow: { tail: 'rgba(120,200,255,0.55)', fill: '#8fd3ff', edge: '#eaf8ff', ring: '120,200,255' },
  stun: { tail: 'rgba(255,225,80,0.55)', fill: '#ffe14d', edge: '#fff7c2', ring: '255,225,80' },
  flame: { tail: 'rgba(255,140,40,0.55)', fill: '#ff8c2a', edge: '#ffe2a0', ring: '255,140,40' },
};
interface Bolt { kind: BoltKind; x: number; y: number; dx: number; dy: number; speed: number; range: number; radius: number; at: number }
interface Burst { x: number; y: number; kind: BurstKind; at: number }
const BURST_MS = 450;
const BOLT_MIN_SCREEN_RADIUS = 6;   // 화면에서 투사체 반지름이 이보다 작아지지 않게 그린다(px)
const CLEANSE_MS = 900;
const QUAKE_HIT_MS = 1400;    // 충격파에 맞은 표시가 남는 시간

interface Shock { x: number; y: number; r0: number; rMax: number; speed: number; at: number; kind: 'repel' | 'quake'; seed: number }
interface Flame { t: number; x: number; y: number; speed: number; at: number; last: number; trail: { x: number; y: number }[] }
interface Absorb { e: number; t: number; at: number; until: number; tickAt: number; o?: { x: number; y: number; r: number }; v?: { x: number; y: number; r: number } }
const FLAME_LIFE_MS = 3000;   // 끝 신호를 놓쳐도 이 시간이 지나면 지운다
const ABSORB_BREAK_MS = 450;  // 선이 끊길 때 파편이 흩어지는 시간
const TICK_MS = 350;          // 키워드를 빼앗는 순간 번쩍이는 시간
interface Hook { e: number; dx: number; dy: number; range: number; ms: number; at: number; hit?: { t: number; at: number; ms: number }; endAt?: number }

/** 씨앗 하나로 같은 순서의 난수를 만든다(균열·파편 모양이 프레임마다 흔들리지 않게) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class SkillFxLayer {
  private shocks: Shock[] = [];
  private hooks: Hook[] = [];
  private stealth = new Map<number, { at: number; until: number }>();
  private bolts = new Map<number, Bolt>();
  private bursts: Burst[] = [];
  private poisons = new Map<number, { stacks: number; at: number; until: number }>();
  private darks = new Map<number, { at: number; until: number }>(); // 암흑에 걸린 원 번호 → 걸린 시각과 끝나는 시각
  private slows = new Map<number, { stacks: number; at: number; until: number }>(); // 슬로우에 걸린 원 → 겹 수와 끝나는 시각
  private stuns = new Map<number, { at: number; until: number }>();
  private flames = new Map<number, Flame>();
  private absorbs = new Map<string, Absorb>(); // 흡수 선("쓴 원:붙든 원") → 시각. 쓴 원 하나가 사거리 안의 모든 원과 선을 잇는다
  private absorbBreaks: { o: { x: number; y: number }; v: { x: number; y: number }; at: number; seed: number }[] = [];
  private cleanses: { e: number; at: number; seed: number }[] = [];
  private quakeHits: { t: number; n: number; at: number; seed: number }[] = []; // 충격파에 맞은 원 번호 → 잃은 개수와 맞은 시각
  private stealthEnded = new Map<number, number>(); // 은신이 막 끝나 다시 나타나는 중인 원 번호 → 끝난 시각
  private puffs: { e: number; at: number; kind: 'out' | 'in' }[] = []; // 은신 시작(out)·끝(in) 연출

  /** 가장 최근에 쓴 그 원의 갈고리 중 조건에 맞는 것(같은 원의 갈고리는 하나만 남기므로 대개 하나다) */
  private latestHook(e: number, ok: (h: Hook) => boolean): Hook | undefined {
    for (let i = this.hooks.length - 1; i >= 0; i--) if (this.hooks[i].e === e && ok(this.hooks[i])) return this.hooks[i];
    return undefined;
  }

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.shocks = []; this.hooks = []; this.stealth.clear(); this.stealthEnded.clear(); this.puffs = []; this.bolts.clear(); this.bursts = []; this.poisons.clear(); this.darks.clear(); this.cleanses = [];
    this.quakeHits = []; this.slows.clear(); this.stuns.clear(); this.flames.clear(); this.absorbs.clear(); this.absorbBreaks = []; }

  show(fx: SkillFx, now: number) {
    switch (fx.id) {
      case 'shockwave': case 'quake':
        if (this.shocks.length >= FX_CAP) this.shocks.shift();
        this.shocks.push({ x: fx.x, y: fx.y, r0: fx.r0, rMax: fx.rMax, speed: fx.speed, at: now, kind: fx.id === 'quake' ? 'quake' : 'repel', seed: Math.floor(Math.random() * 2 ** 31) });
        break;
      case 'hook':
        this.hooks = this.hooks.filter((h) => h.e !== fx.e);
        if (this.hooks.length >= FX_CAP) this.hooks.shift();
        this.hooks.push({ e: fx.e, dx: fx.dx, dy: fx.dy, range: fx.range, ms: fx.ms, at: now });
        break;
      case 'hookHit': {
        const h = this.latestHook(fx.e, (k) => !k.hit);
        if (h) h.hit = { t: fx.t, at: now, ms: fx.ms };
        break;
      }
      case 'hookEnd': {
        const h = this.latestHook(fx.e, (k) => !k.hit && k.endAt === undefined);
        if (h) h.endAt = now;
        break;
      }
      case 'stealth':
        this.stealthEnded.delete(fx.e);
        this.stealth.set(fx.e, { at: now, until: now + fx.ms });
        this.addPuff(fx.e, now, 'out');
        break;
      case 'stealthEnd': this.endStealth(fx.e, now); break;
      case 'bolt':
        if (this.bolts.size >= FX_CAP) this.bolts.delete(this.bolts.keys().next().value as number);
        this.bolts.set(fx.bid, { kind: fx.kind, x: fx.x, y: fx.y, dx: fx.dx, dy: fx.dy, speed: fx.speed, range: fx.range, radius: fx.radius, at: now });
        break;
      case 'boltEnd': {
        const b = this.bolts.get(fx.bid);
        this.bolts.delete(fx.bid);
        if (b && fx.hit !== undefined && fx.x !== undefined && fx.y !== undefined) {
          if (this.bursts.length >= FX_CAP) this.bursts.shift();
          this.bursts.push({ x: fx.x, y: fx.y, kind: b.kind, at: now });
        }
        break;
      }
      case 'poison': this.poisons.set(fx.t, { stacks: fx.stacks, at: now, until: now + fx.ms }); break;
      case 'poisonEnd': this.poisons.delete(fx.t); break;
      case 'darkness': this.darks.set(fx.t, { at: now, until: now + fx.ms }); break;
      case 'slow': this.slows.set(fx.t, { stacks: fx.stacks, at: now, until: now + fx.ms }); break;
      case 'slowEnd': this.slows.delete(fx.t); break;
      case 'stun': this.stuns.set(fx.t, { at: now, until: now + fx.ms }); break;
      case 'stunEnd': this.stuns.delete(fx.t); break;
      case 'flame':
        if (this.flames.size >= FX_CAP) this.flames.delete(this.flames.keys().next().value as number);
        this.flames.set(fx.fid, { t: fx.t, x: fx.x, y: fx.y, speed: fx.speed, at: now, last: now, trail: [] });
        break;
      case 'flameEnd': {
        const f = this.flames.get(fx.fid);
        this.flames.delete(fx.fid);
        const x = fx.x ?? f?.x, y = fx.y ?? f?.y;
        if (fx.hit && x !== undefined && y !== undefined) {
          if (this.bursts.length >= FX_CAP) this.bursts.shift();
          this.bursts.push({ x, y, kind: 'flame', at: now });
        }
        break;
      }
      case 'quakeHit':
        if (this.quakeHits.length >= FX_CAP) this.quakeHits.shift();
        this.quakeHits.push({ t: fx.t, n: fx.n, at: now, seed: Math.floor(Math.random() * 2 ** 31) });
        break;
      case 'absorb': this.absorbs.set(`${fx.e}:${fx.t}`, { e: fx.e, t: fx.t, at: now, until: now + fx.ms, tickAt: -1e9 }); break;
      case 'absorbTick': { const a = this.absorbs.get(`${fx.e}:${fx.t}`); if (a) a.tickAt = now; break; }
      case 'absorbEnd':
        if (fx.t !== undefined) this.breakAbsorb(`${fx.e}:${fx.t}`);
        else for (const [k, a] of [...this.absorbs]) if (a.e === fx.e) this.breakAbsorb(k);
        break;
      case 'cleanse':
        this.darks.delete(fx.e); this.slows.delete(fx.e); this.stuns.delete(fx.e);
        for (const [k, a] of [...this.absorbs]) if (a.e === fx.e || a.t === fx.e) this.breakAbsorb(k); // 선을 쓴 쪽이든 붙들린 쪽이든 끊긴다
        if (this.cleanses.length >= FX_CAP) this.cleanses.shift();
        this.cleanses.push({ e: fx.e, at: now, seed: Math.floor(Math.random() * 2 ** 31) }); // seed: 쓸 때마다 끊어지는 모양이 다르게
        break;
    }
  }

  /** 흡수 선이 끊겼다: 마지막으로 그린 두 끝점에서 파편이 흩어진다 */
  private breakAbsorb(key: string) {
    const a = this.absorbs.get(key);
    this.absorbs.delete(key);
    if (!a?.o || !a.v) return;
    if (this.absorbBreaks.length >= FX_CAP) this.absorbBreaks.shift();
    this.absorbBreaks.push({ o: { x: a.o.x, y: a.o.y }, v: { x: a.v.x, y: a.v.y }, at: performance.now(), seed: Math.floor(Math.random() * 2 ** 31) });
  }

  private addPuff(e: number, at: number, kind: 'out' | 'in') {
    if (this.puffs.length >= FX_CAP) this.puffs.shift();
    this.puffs.push({ e, at, kind });
  }

  private endStealth(e: number, at: number) {
    if (!this.stealth.delete(e)) return;
    this.stealthEnded.set(e, at);
    this.addPuff(e, at, 'in');
  }

  /**
   * 은신(유령) 진행도: 0 = 보통, 1 = 완전히 은신. 들어갈 때와 풀릴 때 STEALTH_FADE_MS에 걸쳐 부드럽게 오르내려서
   * 렉으로 사라진 것과 구분된다. 남에게는 1에서 완전히 안 보이고, 나(와 관전)에게는 반투명으로 보인다.
   */
  stealthProgress(e: number, now: number): number {
    const st = this.stealth.get(e);
    if (st && now >= st.until) this.endStealth(e, st.until); // 시간이 다 됐다
    const cur = this.stealth.get(e);
    if (cur) return Math.min(1, (now - cur.at) / STEALTH_FADE_MS);
    const ended = this.stealthEnded.get(e);
    if (ended === undefined) return 0;
    const p = 1 - (now - ended) / STEALTH_FADE_MS;
    if (p <= 0) { this.stealthEnded.delete(e); return 0; }
    return p;
  }

  /** 은신이 끝날 때까지 남은 ms(은신 중이 아니면 0) */
  stealthLeft(e: number, now: number): number { const st = this.stealth.get(e); return st ? Math.max(0, st.until - now) : 0; }

  /** 내 은신 중인 원 둘레에 일렁이는 점선 고리: 내가 은신 중이라는 표시(남에게는 보이지 않는다) */
  drawStealthRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, z: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,190,255,0.55)';
    ctx.lineWidth = Math.max(2 / z, r * 0.06);
    ctx.setLineDash([r * 0.5, r * 0.35]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -now / 30;
    const wob = this.reducedMotion ? 0 : Math.sin(now / 160) * r * 0.04;
    ctx.beginPath(); ctx.arc(x, y, r + r * 0.12 + wob, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** 반발·충격파·갈고리·투사체·상태 표시: 원 위에 그린다 */
  drawActive(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.drawShocks(ctx, now, z);
    this.drawHooks(ctx, now, z, pos);
    this.drawPuffs(ctx, now, z, pos);
    this.drawBolts(ctx, now, z);
    this.drawFlames(ctx, now, z, pos);
    this.drawAbsorbs(ctx, now, z, pos);
    this.drawPoisons(ctx, now, z, pos);
    this.drawSlows(ctx, now, z, pos);
    this.drawStuns(ctx, now, z, pos);
    this.drawDarks(ctx, now, z, pos);
    this.drawCleanses(ctx, now, z, pos);
    this.drawQuakeHits(ctx, now, z, pos);
  }

  /**
   * 충격파에 맞은 원: 붉은 파열 고리가 퍼지고, 키워드 이름표 조각이 사방으로 튀어 흩어지며, 원 둘레가 붉게 번쩍이고 "-N"이 떠오른다.
   * 누가 맞았는지 멀리서도 보이도록 크기는 화면 기준 최소값을 둔다.
   */
  private drawQuakeHits(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.quakeHits = this.quakeHits.filter((h) => now - h.at < QUAKE_HIT_MS);
    for (const h of this.quakeHits) {
      const o = pos(h.t, now);
      if (!o) continue;
      const p = (now - h.at) / QUAKE_HIT_MS, burst = Math.min(1, (now - h.at) / 520), rnd = seeded(h.seed);
      const r = Math.max(o.r, 14 / z);
      ctx.save();
      // 원 둘레 붉은 번쩍임(처음 0.25초가 가장 진하다)
      const flash = Math.max(0, 1 - (now - h.at) / 260);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,70,100,${0.45 * flash})`;
        ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.05, 0, Math.PI * 2); ctx.fill();
      }
      // 퍼지는 파열 고리 두 겹
      for (let k = 0; k < 2; k++) {
        const bk = Math.max(0, burst - k * 0.18), a = (1 - bk) * (k === 0 ? 0.95 : 0.6);
        if (bk <= 0 || a <= 0) continue;
        ctx.strokeStyle = `rgba(255,${k === 0 ? 225 : 70},${k === 0 ? 230 : 100},${a})`;
        ctx.lineWidth = Math.max(2 / z, r * (0.2 - 0.12 * bk));
        ctx.beginPath(); ctx.arc(o.x, o.y, r * (1 + 1.3 * bk), 0, Math.PI * 2); ctx.stroke();
      }
      // 키워드 조각: 둥근 이름표 모양 조각이 사방으로 튀며 돌고 옅어진다
      const pieces = 5 + h.n;
      for (let i = 0; i < pieces; i++) {
        const ang = rnd() * Math.PI * 2, dist = r * (1.2 + rnd() * 1.6) * (this.reducedMotion ? 0.6 : Math.min(1, burst * 1.4)), spin = (rnd() - 0.5) * 8 * burst;
        const w = r * (0.34 + rnd() * 0.3), ht = w * 0.42, a = Math.max(0, 1 - Math.max(0, p - 0.25) / 0.75);
        ctx.save();
        ctx.translate(o.x + Math.cos(ang) * dist, o.y + Math.sin(ang) * dist + (this.reducedMotion ? 0 : burst * r * 0.5));
        ctx.rotate(ang + spin);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffe3e8'; ctx.strokeStyle = '#ff4664'; ctx.lineWidth = Math.max(1.5 / z, ht * 0.28);
        ctx.beginPath(); ctx.roundRect(-w / 2, -ht / 2, w, ht, ht / 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // "-N": 맞은 원 위로 떠오르는 붉은 숫자
      drawDamage(ctx, `-${h.n}`, o.x, o.y - o.r * 0.9, p, 'lose', Math.max(16 / z, o.r * 0.8), this.reducedMotion);
      ctx.restore();
    }
  }


  /**
   * 투사체(독·암흑·슬로우·스턴)와 맞은 자리의 파열. 위치는 시작점에서 속도 × 지난 시간으로 구해 서버와 같은 곳에 그린다.
   * 공통: 몸 둘레의 부드러운 빛, 끝으로 갈수록 가늘어지는 꼬리 띠, 꼬리에서 흩날리는 입자. 몸통은 종류마다 다르다 —
   * 독은 방울이 맺힌 초록 구체, 암흑은 보라 테두리가 도는 검은 구체와 연기, 슬로우는 돌며 반짝이는 얼음 결정과 눈 알갱이,
   * 스턴은 사방으로 튀는 번개 줄기가 달린 노란 구체. 판정 반지름(radius)은 그대로이고 입자·빛은 그 둘레에만 그린다.
   */
  private drawBolts(ctx: CanvasRenderingContext2D, now: number, z: number) {
    for (const [id, b] of this.bolts) {
      const age = now - b.at, traveled = Math.min(b.range, b.speed * age / 1000);
      if (age > (b.range / b.speed) * 1000 + 400) { this.bolts.delete(id); continue; } // 끝 신호를 놓쳐도 사라진다
      const x = b.x + b.dx * traveled, y = b.y + b.dy * traveled, nx = -b.dy, ny = b.dx;
      const r = Math.max(b.radius, BOLT_MIN_SCREEN_RADIUS / z); // 판정은 월드 반지름 그대로이고, 줌아웃해도 화면에서 이만큼은 보이게 그린다
      const st = BOLT_STYLE[b.kind], rm = this.reducedMotion;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 빛
      const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.4);
      glow.addColorStop(0, `rgba(${st.ring},0.5)`); glow.addColorStop(1, `rgba(${st.ring},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, Math.PI * 2); ctx.fill();
      // 꼬리 띠: 머리에서 넓고 끝에서 점이 되는 삼각 띠(막 쏜 직후에는 지나온 길이만큼만)
      const len = Math.min(r * 9, traveled + r * 2);
      const tail = ctx.createLinearGradient(x, y, x - b.dx * len, y - b.dy * len);
      tail.addColorStop(0, `rgba(${st.ring},0.7)`); tail.addColorStop(1, `rgba(${st.ring},0)`);
      ctx.fillStyle = tail;
      ctx.beginPath(); ctx.moveTo(x + nx * r * 0.95, y + ny * r * 0.95); ctx.lineTo(x - b.dx * len, y - b.dy * len); ctx.lineTo(x - nx * r * 0.95, y - ny * r * 0.95); ctx.closePath(); ctx.fill();
      // 꼬리 입자: 뒤로 흘러가며 작아지고 옅어진다(투사체마다 다른 모양, 프레임마다 흔들리지 않는다)
      if (!rm) {
        const rand = seeded(id * 2654435761);
        for (let i = 0; i < 9; i++) {
          const ph = (age / 560 + rand()) % 1, off = (rand() - 0.5) * 2 * r * (0.5 + ph * 1.1), sz = r * (0.2 + rand() * 0.22) * (1 - ph * 0.7);
          const px = x - b.dx * ph * len + nx * off, py = y - b.dy * ph * len + ny * off;
          ctx.globalAlpha = (1 - ph) * 0.95;
          if (b.kind === 'poison') { ctx.strokeStyle = '#c9ffd0'; ctx.lineWidth = Math.max(1 / z, sz * 0.35); ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.stroke(); }
          else if (b.kind === 'darkness') { ctx.fillStyle = 'rgba(30,18,50,0.8)'; ctx.beginPath(); ctx.arc(px, py, sz * 1.5, 0, Math.PI * 2); ctx.fill(); }
          else if (b.kind === 'slow') { ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = Math.max(1 / z, sz * 0.35); ctx.beginPath(); ctx.moveTo(px - sz, py); ctx.lineTo(px + sz, py); ctx.moveTo(px, py - sz); ctx.lineTo(px, py + sz); ctx.stroke(); }
          else { ctx.fillStyle = '#fff7c2'; ctx.beginPath(); ctx.arc(px, py, sz * 0.8, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      }
      // 몸통
      const spin = rm ? 0 : age / 260;
      if (b.kind === 'poison') {
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        g.addColorStop(0, '#e6ffe8'); g.addColorStop(0.45, '#4cd964'); g.addColorStop(1, '#1b8a33');
        ctx.fillStyle = g; ctx.strokeStyle = st.edge; ctx.lineWidth = Math.max(1.8 / z, r * 0.14);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(230,255,235,0.8)'; ctx.lineWidth = Math.max(1 / z, r * 0.07);
        ctx.beginPath(); ctx.arc(x + r * 0.32, y + r * 0.22, r * 0.17, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x - r * 0.1, y + r * 0.45, r * 0.1, 0, Math.PI * 2); ctx.stroke();
      } else if (b.kind === 'darkness') {
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, '#000'); g.addColorStop(0.7, '#150c25'); g.addColorStop(1, '#2a1650');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9b6cff'; ctx.lineWidth = Math.max(2 / z, r * 0.16);
        for (let i = 0; i < 3; i++) { const a0 = -spin * 1.4 + (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.arc(x, y, r * 1.02, a0, a0 + 1.3); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(200,170,255,0.5)'; ctx.lineWidth = Math.max(1 / z, r * 0.06);
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, spin, spin + Math.PI); ctx.stroke();
      } else if (b.kind === 'slow') {
        const hex = (rad: number) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = spin + (i * Math.PI) / 3; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); };
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.2);
        g.addColorStop(0, '#f4fcff'); g.addColorStop(0.6, '#9bd8ff'); g.addColorStop(1, '#4aa8e8');
        hex(r * 1.2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = Math.max(1.8 / z, r * 0.14); ctx.stroke();
        hex(r * 0.62); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.2 / z, r * 0.08); ctx.stroke();
        ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = spin + (i * Math.PI) / 3; ctx.moveTo(x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 1.0); ctx.lineTo(x - Math.cos(a) * r * 1.0, y - Math.sin(a) * r * 1.0); } ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fff08a'); g.addColorStop(1, '#ffc800');
        // 번개 줄기: 약 70ms마다 모양이 바뀌며 사방으로 뻗는다
        const rand = seeded(Math.floor(rm ? 0 : now / 70) * 131 + id);
        ctx.strokeStyle = '#fff7b0'; ctx.lineWidth = Math.max(1.6 / z, r * 0.14);
        for (let k = 0; k < 5; k++) {
          let a = rand() * Math.PI * 2, px = x + Math.cos(a) * r * 0.9, py = y + Math.sin(a) * r * 0.9;
          ctx.beginPath(); ctx.moveTo(px, py);
          for (let j = 0; j < 3; j++) { a += (rand() - 0.5) * 1.2; px += Math.cos(a) * r * 0.55; py += Math.sin(a) * r * 0.55; ctx.lineTo(px, py); }
          ctx.stroke();
        }
        ctx.fillStyle = g; ctx.strokeStyle = '#fff7c2'; ctx.lineWidth = Math.max(1.8 / z, r * 0.14);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8a6200'; ctx.lineWidth = Math.max(1.8 / z, r * 0.16);
        ctx.beginPath(); ctx.moveTo(x + r * 0.2, y - r * 0.65); ctx.lineTo(x - r * 0.3, y + r * 0.05); ctx.lineTo(x + r * 0.28, y + r * 0.05); ctx.lineTo(x - r * 0.2, y + r * 0.65); ctx.stroke();
      }
      ctx.restore();
    }
    this.bursts = this.bursts.filter((u) => now - u.at < BURST_MS);
    for (const u of this.bursts) {
      const t = (now - u.at) / BURST_MS, ring = BOLT_STYLE[u.kind].ring;
      ctx.save(); ctx.lineCap = 'round';
      const R = Math.max(14, 16 / z);
      // 순간 번쩍임
      if (t < 0.35) { const k = 1 - t / 0.35, g = ctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, R * 2.2); g.addColorStop(0, `rgba(255,255,255,${0.85 * k})`); g.addColorStop(0.4, `rgba(${ring},${0.6 * k})`); g.addColorStop(1, `rgba(${ring},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u.x, u.y, R * 2.2, 0, Math.PI * 2); ctx.fill(); }
      // 퍼지는 고리 두 겹
      for (let k = 0; k < 2; k++) {
        const tk = Math.max(0, t - k * 0.15) / (1 - k * 0.15);
        if (tk <= 0) continue;
        ctx.strokeStyle = `rgba(${ring},${(1 - tk) * (k ? 0.6 : 1)})`; ctx.lineWidth = Math.max(3 / z, 5) * (1 - tk * 0.6);
        ctx.beginPath(); ctx.arc(u.x, u.y, R * (0.8 + 4 * tk) * (k ? 0.7 : 1), 0, Math.PI * 2); ctx.stroke();
      }
      // 튀는 입자
      if (!this.reducedMotion) {
        const rand = seeded(Math.floor(u.at) | 1);
        ctx.strokeStyle = `rgba(${ring},${1 - t})`; ctx.lineWidth = Math.max(2 / z, 3);
        for (let i = 0; i < 10; i++) {
          const a = rand() * Math.PI * 2, d0 = R * (0.8 + t * 3.2) * (0.7 + rand() * 0.6), d1 = d0 + R * 0.6 * (1 - t);
          ctx.beginPath(); ctx.moveTo(u.x + Math.cos(a) * d0, u.y + Math.sin(a) * d0); ctx.lineTo(u.x + Math.cos(a) * d1, u.y + Math.sin(a) * d1); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /** 독에 걸린 원: 초록 고리와 떠오르는 방울, 머리 위 ☠×스택 수(모두에게 보인다) */
  private drawPoisons(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [e, p] of this.poisons) {
      if (now >= p.until + 400) { this.poisons.delete(e); continue; }
      const o = pos(e, now);
      if (!o) continue;
      ctx.save();
      ctx.strokeStyle = 'rgba(90,220,90,0.8)'; ctx.lineWidth = Math.max(3 / z, o.r * 0.08);
      ctx.setLineDash([o.r * 0.35, o.r * 0.25]); ctx.lineDashOffset = this.reducedMotion ? 0 : now / 40;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (!this.reducedMotion) {
        ctx.fillStyle = 'rgba(120,235,110,0.65)';
        for (let i = 0; i < 6; i++) {
          const ph = ((now / 1200) + i / 6) % 1, ang = i * 2.1 + e;
          ctx.beginPath(); ctx.arc(o.x + Math.cos(ang) * o.r * 0.7, o.y - o.r * 0.4 - ph * o.r * 0.9, Math.max(2 / z, o.r * 0.08) * (1 - ph), 0, Math.PI * 2); ctx.fill();
        }
      }
      const fs = Math.max(14 / z, Math.min(o.r * 0.5, 36)), left = Math.max(0, Math.ceil((p.until - now) / 1000));
      ctx.font = `700 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2 / z, fs * 0.15); ctx.strokeStyle = 'rgba(10,40,10,0.9)'; ctx.fillStyle = '#b8ffb0';
      const label = `☠ ×${p.stacks}  ${left}s`;
      ctx.strokeText(label, o.x, o.y - o.r - 6 / z); ctx.fillText(label, o.x, o.y - o.r - 6 / z);
      ctx.restore();
    }
  }

  /**
   * 암흑에 걸린 원(모두에게 보인다): 원 위에 보라빛 어두운 안개, 둘레를 도는 연기 조각, 머리 위 🕶️와 남은 시간 링.
   * 독(초록 점선 고리·방울)과 색뿐 아니라 모양(안개·연기·🕶️)으로도 구별된다. 줌아웃해도 보이도록 화면 기준 최소 크기가 있다.
   */
  private drawDarks(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [e, d] of this.darks) {
      if (now >= d.until + 300) { this.darks.delete(e); continue; }
      const o = pos(e, now);
      if (!o) continue;
      const total = Math.max(1, d.until - d.at), left = Math.max(0, d.until - now);
      const fade = Math.min(1, (now - d.at) / 200, (left + 300) / 300); // 걸릴 때 빠르게 덮이고 끝날 때 부드럽게 걷힌다
      const pulse = this.reducedMotion ? 0 : Math.sin(now / 220) * 0.06;
      ctx.save();
      // 안개: 가운데는 짙고 가장자리는 번지는 보라·검정
      const fog = ctx.createRadialGradient(o.x, o.y, o.r * 0.2, o.x, o.y, o.r * 1.15);
      fog.addColorStop(0, `rgba(10,6,20,${(0.62 + pulse) * fade})`);
      fog.addColorStop(0.75, `rgba(40,20,80,${(0.5 + pulse) * fade})`);
      fog.addColorStop(1, 'rgba(60,30,110,0)');
      ctx.fillStyle = fog;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.15, 0, Math.PI * 2); ctx.fill();
      // 둘레를 도는 연기 조각
      if (!this.reducedMotion) {
        ctx.fillStyle = `rgba(30,16,56,${0.55 * fade})`; ctx.strokeStyle = `rgba(155,108,255,${0.6 * fade})`;
        ctx.lineWidth = Math.max(1.5 / z, o.r * 0.03);
        const wisp = Math.max(5 / z, o.r * 0.14);
        for (let i = 0; i < 4; i++) {
          const a = now / 700 * (i % 2 ? -1 : 1) + (i / 4) * Math.PI * 2 + e, dist = o.r * (1.0 + 0.12 * Math.sin(now / 300 + i));
          ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * dist, o.y + Math.sin(a) * dist, wisp * (0.8 + 0.3 * Math.sin(now / 200 + i * 2)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      // 남은 시간 링(위에서 시계 방향으로 줄어든다)
      ctx.strokeStyle = `rgba(155,108,255,${0.9 * fade})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.07); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / total)); ctx.stroke();
      // 머리 위 🕶️
      const fs = Math.max(18 / z, Math.min(o.r * 0.6, 44));
      ctx.globalAlpha = fade; ctx.font = `${fs}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('🕶️', o.x, o.y - o.r * 1.1 - 4 / z);
      ctx.restore();
    }
  }

  /**
   * 정화: 원을 감싼 하늘색 테두리가 불규칙하게 금이 가다 여러 조각의 호로 끊어져 사방으로 튀어 나가며 돌고 떨어지는 연출.
   * 처음에는 테두리가 팽팽하게 떨리며 끊어질 자리에 금이 가고, "툭" 끊어지면 길이가 제각각인 호 조각이 바깥으로 흩어지며
   * 돌고 아래로 떨어지며 사라지고, 하늘색 충격 고리가 퍼진다. 조각 수·길이·틈·튀는 거리는 쓸 때마다 다르다(seed).
   * 줌아웃해도 보이도록 화면 기준 최소 굵기가 있고, 움직임 줄이기 설정이면 흩어지는 거리와 회전을 줄인다.
   */
  private drawCleanses(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.cleanses = this.cleanses.filter((c) => now - c.at < CLEANSE_MS);
    const SNAP = 0.16, SKY = 'rgba(125,211,255,0.9)';
    for (const c of this.cleanses) {
      const o = pos(c.e, now);
      if (!o) continue;
      const t = (now - c.at) / CLEANSE_MS;
      const R = o.r * 1.06, lw = Math.max(3 / z, o.r * 0.1);
      // 같은 seed면 같은 조각이 나오는 간단한 난수(mulberry32)
      let st = c.seed >>> 0;
      const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      const count = 7 + Math.floor(rnd() * 4); // 7~10조각
      const weights = Array.from({ length: count }, () => 0.45 + rnd() * 1.1), sum = weights.reduce((a, w) => a + w, 0);
      const start0 = rnd() * Math.PI * 2;
      let cursor = start0;
      const pieces = weights.map((w) => {
        const span = (w / sum) * Math.PI * 2, gap = span * (0.06 + rnd() * 0.16), a0 = cursor + gap / 2, a1 = cursor + span - gap / 2;
        cursor += span;
        return { a0, a1, mid: (a0 + a1) / 2, far: 0.35 + rnd() * 1.1, spin: (rnd() - 0.5) * 6, fall: 0.6 + rnd() * 0.7, wob: rnd() * Math.PI * 2 };
      });
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (t < SNAP) { // 끊기기 직전: 테두리가 팽팽하게 떨리고, 끊어질 자리마다 금(밝은 짧은 선)이 점점 선명해진다
        const k = t / SNAP, shake = this.reducedMotion ? 0 : Math.sin(now / 16) * o.r * 0.02 * k;
        ctx.strokeStyle = SKY; ctx.lineWidth = lw; ctx.shadowColor = 'rgba(125,211,255,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 8;
        ctx.beginPath(); ctx.arc(o.x, o.y, R + shake, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(240,250,255,${0.95 * k})`; ctx.lineWidth = Math.max(1.6 / z, lw * 0.35);
        for (const p of pieces) {
          const a = p.a0 - 0.02;
          ctx.beginPath(); ctx.moveTo(o.x + Math.cos(a) * (R - lw * 0.9), o.y + Math.sin(a) * (R - lw * 0.9)); ctx.lineTo(o.x + Math.cos(a) * (R + lw * 0.9), o.y + Math.sin(a) * (R + lw * 0.9)); ctx.stroke();
        }
      } else { // 끊어져 흩어지는 조각들
        const u = (t - SNAP) / (1 - SNAP), ease = 1 - (1 - u) ** 3, spread = this.reducedMotion ? 0.4 : 1;
        for (const p of pieces) {
          const dist = o.r * p.far * ease * spread;
          // 조각의 가운데(원래 테두리 위의 점)가 바깥으로 흩어지고, 포물선으로 떨어지며, 제 가운데를 축으로 돈다
          const mx = o.x + Math.cos(p.mid) * (R + dist) + Math.sin(now / 90 + p.wob) * (this.reducedMotion ? 0 : o.r * 0.02);
          const my = o.y + Math.sin(p.mid) * (R + dist) + o.r * 0.9 * p.fall * u * u * spread;
          ctx.save();
          ctx.translate(mx, my); ctx.rotate(this.reducedMotion ? 0 : p.spin * u);
          ctx.globalAlpha = Math.max(0, 1 - u ** 1.6);
          ctx.strokeStyle = '#e3f5ff'; ctx.lineWidth = lw * (1 - 0.45 * u);
          ctx.shadowColor = 'rgba(125,211,255,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 7;
          ctx.beginPath(); ctx.arc(-Math.cos(p.mid) * R, -Math.sin(p.mid) * R, R, p.a0, p.a1); ctx.stroke();
          ctx.restore();
        }
        // 끊어지는 순간 하늘색 충격 고리와 번쩍임
        ctx.strokeStyle = `rgba(125,211,255,${0.9 * (1 - u)})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.12) * (1 - u * 0.5);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.05 + 1.4 * ease), 0, Math.PI * 2); ctx.stroke();
        if (u < 0.25) {
          ctx.fillStyle = `rgba(225,245,255,${0.35 * (1 - u / 0.25)})`;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.15, 0, Math.PI * 2); ctx.fill();
        }
      }
      // 원 위에 정화 스킬 아이콘(✨)이 톡 나타났다가 위로 떠오르며 사라진다
      {
        const pop = Math.min(1, t / 0.12), fade = Math.min(1, (1 - t) / 0.35);
        const fs = Math.max(20 / z, Math.min(o.r * 0.75, 52)) * (this.reducedMotion ? 1 : 0.7 + 0.3 * pop + (t < 0.12 ? 0.25 * Math.sin(pop * Math.PI) : 0));
        const rise = this.reducedMotion ? 0 : o.r * 0.5 * t;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade); ctx.shadowColor = 'rgba(125,211,255,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 10;
        ctx.font = `${fs}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('✨', o.x, o.y - o.r * 1.15 - 4 / z - rise);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  /**
   * 은신을 쓰고 풀릴 때 그 원 둘레의 연출(모두에게 보인다): 시작에는 보라색 고리가 원으로 모여들며 흩어진 빛이 빨려 들어가고,
   * 끝에는 고리가 퍼지며 빛이 흩어진다. 스킬을 썼다는 것을 알리는 단서다.
   */
  private drawPuffs(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.puffs = this.puffs.filter((p) => now - p.at < PUFF_MS);
    for (const p of this.puffs) {
      const o = pos(p.e, now);
      if (!o) continue;
      const t = (now - p.at) / PUFF_MS, ease = 1 - (1 - t) ** 3, fade = 1 - t;
      const k = p.kind === 'out' ? 1 - ease : ease; // out: 바깥에서 안으로, in: 안에서 바깥으로
      ctx.save();
      ctx.strokeStyle = `rgba(200,185,255,${0.85 * fade})`;
      ctx.lineWidth = Math.max(3 / z, o.r * 0.1) * (0.4 + fade);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.05 + 1.1 * k), 0, Math.PI * 2); ctx.stroke();
      if (!this.reducedMotion) {
        ctx.fillStyle = `rgba(225,215,255,${0.9 * fade})`;
        const n = 12, base = p.at * 0.013;
        for (let i = 0; i < n; i++) {
          const a = base + (i / n) * Math.PI * 2, d = o.r * (1.1 + 1.5 * k), s = Math.max(2.5 / z, o.r * 0.07) * (0.6 + 0.4 * fade);
          ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, s, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }



  private drawShocks(ctx: CanvasRenderingContext2D, now: number, z: number) {
    this.shocks = this.shocks.filter((s) => now - s.at < (s.rMax - s.r0) / s.speed * 1000 + SHOCK_FADE_MS);
    for (const s of this.shocks) this.drawRepel(ctx, s, now, z);
  }

  private drawHooks(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    const keep: Hook[] = [];
    for (const h of this.hooks) {
      const o = pos(h.e, now);
      if (!o) continue;
      const age = now - h.at;
      if (h.endAt === undefined && !h.hit && age > h.ms + HOOK_WAIT_MS) h.endAt = h.at + h.ms; // 서버 결과가 안 오면 빗나간 것으로 거둔다
      const width = Math.max(4 / z, o.r * 0.12);
      ctx.save();
      ctx.lineCap = 'round';
      if (h.hit) {
        const v = pos(h.hit.t, now);
        if (!v || now - h.hit.at > h.hit.ms + 120) { ctx.restore(); continue; }
        // 붙잡힘: 내 원 가장자리에서 붙잡힌 원 가장자리까지 팽팽한 쇠사슬, 끝에는 갈고리 날이 박혀 있다
        const dx = v.x - o.x, dy = v.y - o.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const tipX = v.x - ux * v.r * 0.8, tipY = v.y - uy * v.r * 0.8;
        this.drawChain(ctx, o.x + ux * o.r * 0.8, o.y + uy * o.r * 0.8, tipX, tipY, width, 0, now);
        this.drawClaw(ctx, tipX, tipY, ux, uy, width);
        ctx.lineWidth = Math.max(3 / z, v.r * 0.1);
        ctx.strokeStyle = 'rgba(255,70,100,0.9)';
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r + 5 / z, 0, Math.PI * 2); ctx.stroke(); // 붙잡힌 원
        keep.push(h); ctx.restore(); continue;
      }
      let frac = Math.min(1, age / h.ms);
      if (h.endAt !== undefined) {
        // 서버는 끝까지 뻗은 뒤에 빗나갔다고 알리므로, 알림이 일러도 사거리 끝까지 뻗은 다음에 거둔다
        const start = Math.max(h.endAt, h.at + h.ms), t2 = (now - start) / h.ms; // 거두는 데도 뻗을 때와 같은 시간
        if (t2 >= 1) { ctx.restore(); continue; }
        frac = t2 <= 0 ? Math.min(1, age / h.ms) : 1 - t2;
      } else {
        // 사거리(판정과 같다)를 옅은 점선으로 미리 보여 준다
        ctx.setLineDash([8 / z, 8 / z]);
        ctx.strokeStyle = 'rgba(255,110,130,0.3)';
        ctx.lineWidth = Math.max(2 / z, width * 0.4);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + h.dx * h.range, o.y + h.dy * h.range); ctx.stroke();
        ctx.setLineDash([]);
      }
      const hx = o.x + h.dx * h.range * frac, hy = o.y + h.dy * h.range * frac;
      // 던질 때는 팽팽하게, 거둘 때는 늘어진 사슬이 출렁인다
      const slack = h.endAt !== undefined ? Math.sin(Math.min(1, Math.max(0, frac)) * Math.PI) : 0;
      this.drawChain(ctx, o.x + h.dx * o.r * 0.8, o.y + h.dy * o.r * 0.8, hx, hy, width, slack, now);
      this.drawClaw(ctx, hx, hy, h.dx, h.dy, width);
      keep.push(h);
      ctx.restore();
    }
    this.hooks = keep;
  }

  /** 쇠사슬: 고리가 번갈아 정면(타원 고리)과 옆면(가는 막대)으로 보이며 겹쳐 이어진다. slack > 0이면 늘어져 출렁인다. 판정은 중심선 기준이라 굵기는 보기만 바꾼다. */
  private drawChain(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, slack: number, now: number) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux, ang = Math.atan2(uy, ux);
    const thick = width * 1.15;                              // 고리 폭
    const pitch = Math.max(thick * 1.45, len / 90);          // 고리 간격(너무 길면 개수 상한)
    const linkLen = pitch * 1.6, wire = thick * 0.3;         // 고리 길이(이웃과 겹침), 철사 굵기
    const n = Math.max(1, Math.floor(len / pitch));
    const wob = this.reducedMotion ? 0 : now / 90;
    const at = (i: number) => {
      const u = (i + 0.5) / n, off = slack * thick * 2.2 * Math.sin(u * Math.PI) * Math.sin(u * 7 + wob);
      return { x: x1 + (x2 - x1) * u + nx * off, y: y1 + (y2 - y1) * u + ny * off };
    };
    ctx.save();
    ctx.lineCap = 'round';
    // 바깥 붉은 빛: 이 줄이 공격이라는 표시(스킬 색)
    ctx.strokeStyle = 'rgba(255,70,100,0.28)';
    ctx.lineWidth = thick * 1.9;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    for (let i = 0; i < n; i++) { const p = at(i); ctx.lineTo(p.x, p.y); }
    ctx.lineTo(x2, y2); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const { x, y } = at(i), ring = i % 2 === 0;
      const rx = linkLen / 2, ry = thick / 2;
      ctx.beginPath();
      if (ring) ctx.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
      else { ctx.moveTo(x - ux * rx * 0.92, y - uy * rx * 0.92); ctx.lineTo(x + ux * rx * 0.92, y + uy * rx * 0.92); }
      ctx.strokeStyle = '#1d222c'; ctx.lineWidth = wire * 1.9; ctx.stroke();   // 어두운 윤곽
      ctx.strokeStyle = ring ? '#aab4c4' : '#8a94a6'; ctx.lineWidth = wire; ctx.stroke(); // 강철 몸통(옆면은 살짝 어둡게)
      ctx.beginPath();
      if (ring) ctx.ellipse(x - nx * ry * 0.22, y - ny * ry * 0.22, rx * 0.88, ry * 0.78, ang, Math.PI * 1.05, Math.PI * 1.85);
      else { ctx.moveTo(x - ux * rx * 0.6 - nx * wire * 0.2, y - uy * rx * 0.6 - ny * wire * 0.2); ctx.lineTo(x + ux * rx * 0.6 - nx * wire * 0.2, y + uy * rx * 0.6 - ny * wire * 0.2); }
      ctx.strokeStyle = 'rgba(245,249,255,0.9)'; ctx.lineWidth = wire * 0.32; ctx.stroke(); // 윗면 반사광
    }
    ctx.restore();
  }

  /** 갈고리 날: (x, y)가 사슬이 걸리는 고리 자리이고 (dx, dy) 쪽으로 뻗는다. 단일 창끝처럼 길쭉하고 뾰족한 삼각 날 하나와 목 부분, 사슬 고리. */
  private drawClaw(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, width: number) {
    const s = width * 2.4; // 날 크기
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx)); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 창날: 목에서 넓어졌다가 끝으로 갈수록 좁아지는 길쭉한 삼각형(앞 끝이 뾰족하다)
    const blade = () => { ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.38, -0.3); ctx.lineTo(1.5, 0); ctx.lineTo(0.38, 0.3); ctx.closePath(); };
    blade(); ctx.fillStyle = '#b4bdcc'; ctx.fill();
    // 면 나누기: 위쪽 면은 밝게, 아래쪽 면은 어둡게 해서 가운데 능선이 선 입체 날로 보이게 한다
    ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.38, -0.3); ctx.lineTo(1.5, 0); ctx.closePath(); ctx.fillStyle = '#e6ecf6'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.38, 0.3); ctx.lineTo(1.5, 0); ctx.closePath(); ctx.fillStyle = '#8791a4'; ctx.fill();
    blade(); ctx.strokeStyle = '#1d222c'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.1, 0); ctx.lineTo(1.4, 0); ctx.strokeStyle = 'rgba(29,34,44,0.55)'; ctx.lineWidth = 0.03; ctx.stroke(); // 가운데 능선
    // 목(날과 사슬을 잇는 짧은 대)과 사슬이 걸리는 고리
    ctx.beginPath(); ctx.moveTo(-0.3, 0); ctx.lineTo(0.05, 0);
    ctx.strokeStyle = '#1d222c'; ctx.lineWidth = 0.26; ctx.stroke();
    ctx.strokeStyle = '#b4bdcc'; ctx.lineWidth = 0.14; ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.42, 0, 0.17, 0, Math.PI * 2);
    ctx.strokeStyle = '#1d222c'; ctx.lineWidth = 0.17; ctx.stroke();
    ctx.strokeStyle = '#b4bdcc'; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.restore();
  }

  /**
   * 반발·충격파: 내 원 둘레로 퍼지는 파문. 매끈한 이중 고리와 고리를 따라 천천히 도는 판 조각으로 단단한 느낌을 낸다.
   * 둘은 모양이 같고 색만 다르다. 반발은 청록이고 안쪽을 채운 반투명 돔이 있으며, 충격파는 붉고 안쪽이 비어 있다(고리만 퍼진다). 그림은 판정 반지름(radius) 안에만 그린다.
   */
  private drawRepel(ctx: CanvasRenderingContext2D, s: Shock, now: number, z: number) {
    const age = now - s.at, travelMs = Math.max(1, (s.rMax - s.r0) / s.speed * 1000);
    const radius = Math.min(s.rMax, s.r0 + (s.speed * age) / 1000);
    const alpha = 1 - Math.max(0, (age - travelMs) / SHOCK_FADE_MS);
    const band = Math.max(5 / z, s.r0 * 0.2);
    const quake = s.kind === 'quake';
    const c = quake
      ? { range: '255,110,130', outer: '255,228,232', inner: '255,70,100', plate: '255,240,243' }
      : { range: '90,220,235', outer: '225,252,255', inner: '40,190,215', plate: '255,255,255' };
    ctx.save();
    ctx.setLineDash([12 / z, 8 / z]);
    ctx.strokeStyle = `rgba(${c.range},${0.4 * alpha})`;
    ctx.lineWidth = Math.max(2 / z, 3 / z);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.rMax, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // 돔(반발만): 가운데는 거의 투명, 가장자리로 갈수록 짙은 청록. 충격파는 안쪽을 비워 두고 고리만 그린다
    if (!quake) {
      const dome = ctx.createRadialGradient(s.x, s.y, Math.max(0, radius * 0.35), s.x, s.y, radius);
      dome.addColorStop(0, 'rgba(120,235,245,0)');
      dome.addColorStop(0.7, `rgba(90,215,235,${0.16 * alpha})`);
      dome.addColorStop(1, `rgba(150,240,255,${0.34 * alpha})`);
      ctx.fillStyle = dome;
      ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    // 이중 고리: 바깥은 밝고 굵게, 안쪽은 진하고 얇게
    ctx.strokeStyle = `rgba(${c.outer},${0.95 * alpha})`; ctx.lineWidth = band * 0.42;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 0.21), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(${c.inner},${0.9 * alpha})`; ctx.lineWidth = band * 0.24;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 0.62), 0, Math.PI * 2); ctx.stroke();
    // 방패 판 조각: 안쪽 고리 둘레를 천천히 도는 짧은 호
    const plates = Math.max(6, Math.min(16, Math.round((Math.PI * 2 * radius * z) / 110))), spin = this.reducedMotion ? 0 : age / 900;
    ctx.strokeStyle = `rgba(${c.plate},${0.75 * alpha})`; ctx.lineWidth = band * 0.16; ctx.lineCap = 'round';
    for (let i = 0; i < plates; i++) {
      const a0 = spin + (i / plates) * Math.PI * 2, span = (Math.PI * 2 / plates) * 0.45;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 1.0), a0, a0 + span); ctx.stroke();
    }
    ctx.restore();
  }

  /** 슬로우에 걸린 원: 얼음 고리와 떨어지는 눈송이, 머리 위 🧊×겹 수와 남은 초 */
  private drawSlows(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [e, p] of this.slows) {
      if (now >= p.until + 400) { this.slows.delete(e); continue; }
      const o = pos(e, now);
      if (!o) continue;
      const fade = Math.min(1, (now - p.at) / 150, (p.until + 400 - now) / 400);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(140,215,255,0.9)'; ctx.lineWidth = Math.max(3 / z, o.r * 0.09);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(235,250,255,0.9)'; ctx.lineWidth = Math.max(1.5 / z, o.r * 0.03);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.2, 0, Math.PI * 2); ctx.stroke();
      if (!this.reducedMotion) {
        ctx.fillStyle = 'rgba(220,245,255,0.85)';
        for (let i = 0; i < 7; i++) {
          const ph = ((now / 1500) + i / 7) % 1, ang = i * 2.4 + e, sz = Math.max(2 / z, o.r * 0.07) * (1 - ph * 0.5);
          const x = o.x + Math.cos(ang) * o.r * 0.9, y = o.y - o.r * 1.0 + ph * o.r * 1.8;
          ctx.beginPath(); ctx.moveTo(x, y - sz * 1.4); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz * 1.4); ctx.lineTo(x - sz, y); ctx.closePath(); ctx.fill();
        }
      }
      const fs = Math.max(14 / z, Math.min(o.r * 0.5, 36)), left = Math.max(0, Math.ceil((p.until - now) / 1000));
      ctx.font = `700 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2 / z, fs * 0.15); ctx.strokeStyle = 'rgba(8,30,50,0.9)'; ctx.fillStyle = '#d6f1ff';
      const label = `🧊 ×${p.stacks}  ${left}s`;
      ctx.strokeText(label, o.x, o.y - o.r * 1.2 - 6 / z); ctx.fillText(label, o.x, o.y - o.r * 1.2 - 6 / z);
      ctx.restore();
    }
  }

  /** 별 하나: 중심 (x, y), 바깥 반지름 ro, 회전 rot. 노란 몸통에 어두운 윤곽과 밝은 심 */
  private starShape(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, rot: number, z: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (Math.PI * i) / 5 - Math.PI / 2, r = i % 2 === 0 ? ro : ro * 0.46;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#7a5200'; ctx.lineWidth = Math.max(1.4 / z, ro * 0.22); ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(x - ro * 0.12, y - ro * 0.12, ro * 0.22, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * 스턴에 걸린 원: 머리 위에서 별들이 타원 궤도로 빙글 도는 "어지러움" 고리(만화에서 기절한 머리 위의 그 모양). 앞쪽 별은 크고 선명하게,
   * 뒤쪽 별은 작고 흐리게 그려 입체로 보이고, 뒤쪽 별은 원 뒤에 가려지는 느낌을 위해 먼저 그린다. 원 둘레에는 노란 번쩍이는 고리가 있다.
   */
  private drawStuns(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [e, p] of this.stuns) {
      if (now >= p.until + 300) { this.stuns.delete(e); continue; }
      const o = pos(e, now);
      if (!o) continue;
      const fade = Math.min(1, (now - p.at) / 100, (p.until + 300 - now) / 300);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = `rgba(255,225,80,${this.reducedMotion ? 0.8 : 0.5 + 0.35 * Math.sin(now / 70)})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.07);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2); ctx.stroke();
      const cy = o.y - o.r * 1.12, rx = Math.max(o.r * 0.78, 16 / z), ry = rx * 0.3, star = Math.max(o.r * 0.24, 7 / z);
      // 궤도 고리(옅은 타원)
      ctx.strokeStyle = 'rgba(255,225,80,0.35)'; ctx.lineWidth = Math.max(1.5 / z, star * 0.25);
      ctx.beginPath(); ctx.ellipse(o.x, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      const n = 4, spin = this.reducedMotion ? 0 : now / 420;
      const items = Array.from({ length: n }, (_, i) => { const a = spin + (i * Math.PI * 2) / n; return { a, depth: (Math.sin(a) + 1) / 2, x: o.x + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }; })
        .sort((u, v) => u.depth - v.depth); // 뒤쪽(depth 작음)부터 그린다
      for (const it of items) {
        ctx.globalAlpha = fade * (0.45 + 0.55 * it.depth);
        this.starShape(ctx, it.x, it.y, star * (0.65 + 0.45 * it.depth), this.reducedMotion ? 0 : -spin * 1.6, z);
      }
      ctx.restore();
    }
  }

  /**
   * 불꽃: 출발점에서 대상 원의 지금 위치를 향해 매 프레임 방향을 고쳐 날아가는 유도탄(서버도 같은 식으로 쫓는다).
   * 주황 몸통과 흰 노랑 심지, 지나온 자리를 따라 줄어드는 꼬리. 끝 신호(flameEnd)가 없어도 FLAME_LIFE_MS 뒤에 사라진다.
   */
  private drawFlames(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [id, f] of this.flames) {
      if (now - f.at > FLAME_LIFE_MS) { this.flames.delete(id); continue; }
      const dt = Math.min(0.1, (now - f.last) / 1000);
      f.last = now;
      const tgt = pos(f.t, now);
      let dx = 0, dy = 0;
      if (tgt) {
        dx = tgt.x - f.x; dy = tgt.y - f.y;
        const d = Math.hypot(dx, dy), step = f.speed * dt;
        if (d > 1e-6) { const k = Math.min(1, step / d); f.x += dx * k; f.y += dy * k; }
      }
      f.trail.push({ x: f.x, y: f.y });
      if (f.trail.length > 14) f.trail.shift();
      const r = Math.max(8, 10 / z), dir = Math.atan2(dy, dx || 1e-6);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < f.trail.length; i++) { // 꼬리: 오래된 쪽일수록 가늘고 투명
        const k = i / f.trail.length;
        ctx.strokeStyle = `rgba(255,${Math.round(90 + 90 * k)},30,${0.5 * k})`; ctx.lineWidth = r * 1.5 * k;
        ctx.beginPath(); ctx.moveTo(f.trail[i - 1].x, f.trail[i - 1].y); ctx.lineTo(f.trail[i].x, f.trail[i].y); ctx.stroke();
      }
      if (!this.reducedMotion) { // 불씨: 꼬리에서 흩날리는 작은 불똥
        const rand = seeded(id * 40503);
        for (let i = 0; i < 7; i++) {
          const ph = ((now - f.at) / 480 + rand()) % 1, tp = f.trail[Math.max(0, f.trail.length - 1 - Math.floor(ph * (f.trail.length - 1)))];
          const off = (rand() - 0.5) * r * 1.6 * (0.4 + ph);
          ctx.globalAlpha = 1 - ph; ctx.fillStyle = i % 2 ? '#ffd36a' : '#ff7a1c';
          ctx.beginPath(); ctx.arc(tp.x + off, tp.y - off * 0.5 - ph * r * 0.8, r * 0.2 * (1 - ph * 0.6), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2.2);
      glow.addColorStop(0, 'rgba(255,170,60,0.55)'); glow.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      // 물방울 모양 불꽃: 날아가는 쪽이 둥글고 뒤쪽이 뾰족하게 일렁인다
      const flick = this.reducedMotion ? 0 : Math.sin(now / 45 + id) * 0.15;
      ctx.translate(f.x, f.y); ctx.rotate(dir);
      ctx.fillStyle = '#ff7a1c'; ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = Math.max(1.5 / z, 2);
      ctx.beginPath(); ctx.moveTo(-r * (2.1 + flick), 0); ctx.quadraticCurveTo(-r * 0.6, -r * 1.05, r * 0.4, -r * 0.8); ctx.arc(r * 0.2, 0, r * 0.82, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(-r * 0.6, r * 1.05, -r * (2.1 + flick), 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(r * 0.05, 0, r * 0.7, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 흡수: 쓴 원에서 붙든 원까지 이어지는 에너지 선. 갈고리의 쇠사슬과 달리 보라·자홍으로 맥동하는 빛줄기이고,
   * 붙든 원에서 쓴 원 쪽으로 빨려 드는 빛 알갱이가 흐른다. 매 프레임 두 원의 현재 위치를 이어 그리므로 움직여도 따라간다.
   * 키워드를 빼앗는 순간(absorbTick)에는 붙든 원이 번쩍이고, 끊기면 파편이 흩어진다.
   */
  private drawAbsorbs(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [key, a] of this.absorbs) {
      if (now >= a.until + 600) { this.absorbs.delete(key); continue; }
      const o = pos(a.e, now), v = pos(a.t, now);
      if (!o || !v) continue;
      a.o = o; a.v = v;
      const dx = v.x - o.x, dy = v.y - o.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const x1 = o.x + ux * o.r * 0.7, y1 = o.y + uy * o.r * 0.7, x2 = v.x - ux * v.r * 0.7, y2 = v.y - uy * v.r * 0.7;
      const fade = Math.min(1, (now - a.at) / 150, (a.until + 600 - now) / 600);
      const pulse = this.reducedMotion ? 0.5 : (Math.sin(now / 110) + 1) / 2;
      const w = Math.max(4 / z, o.r * 0.12);
      ctx.save();
      ctx.globalAlpha = fade; ctx.lineCap = 'round';
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, 'rgba(255,90,220,0.95)'); g.addColorStop(1, 'rgba(150,90,255,0.95)');
      ctx.strokeStyle = 'rgba(190,90,255,0.22)'; ctx.lineWidth = w * (2.6 + pulse);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = w * (0.8 + pulse * 0.5);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,255,0.9)'; ctx.lineWidth = Math.max(1.5 / z, w * 0.25);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // 빨려 드는 알갱이: 붙든 원 → 쓴 원. 선이 길수록 알갱이도 늘어난다
      const dots = this.reducedMotion ? 0 : Math.max(5, Math.min(24, Math.round(Math.hypot(x2 - x1, y2 - y1) * z / 40)));
      ctx.fillStyle = '#ffd8ff';
      for (let i = 0; i < dots; i++) {
        const ph = ((now / 650) + i / dots) % 1, px = x2 + (x1 - x2) * ph, py = y2 + (y1 - y2) * ph, sz = Math.max(2 / z, w * 0.5) * (0.5 + 0.7 * (1 - ph));
        ctx.beginPath(); ctx.arc(px + (-uy) * Math.sin(ph * 14 + i) * w * 0.9, py + ux * Math.sin(ph * 14 + i) * w * 0.9, sz, 0, Math.PI * 2); ctx.fill();
      }
      // 양 끝의 작은 빛
      for (const [bx, by, c] of [[x1, y1, '255,120,230'], [x2, y2, '160,100,255']] as const) {
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, w * 2.6);
        rg.addColorStop(0, `rgba(${c},0.9)`); rg.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(bx, by, w * 2.6, 0, Math.PI * 2); ctx.fill();
      }
      // 키워드를 빼앗는 순간: 붙든 원 둘레 번쩍임과 −1
      const tk = (now - a.tickAt) / TICK_MS;
      if (tk >= 0 && tk < 1) {
        ctx.globalAlpha = (1 - tk) * fade;
        ctx.strokeStyle = '#ffd8ff'; ctx.lineWidth = Math.max(3 / z, v.r * 0.12);
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r * (1.05 + tk * 0.5), 0, Math.PI * 2); ctx.stroke();
        const fs = Math.max(14 / z, Math.min(v.r * 0.5, 34));
        ctx.font = `800 ${fs}px "Noto Sans KR", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = Math.max(2 / z, fs * 0.15); ctx.strokeStyle = 'rgba(40,10,50,0.9)'; ctx.fillStyle = '#ffb3f5';
        const ty = v.y - v.r - 6 / z - tk * v.r * 0.6;
        ctx.strokeText('−1', v.x, ty); ctx.fillText('−1', v.x, ty);
      }
      ctx.restore();
    }
    // 끊어진 선: 두 끝점 사이를 쪼갠 조각이 양쪽으로 튀며 사라진다
    this.absorbBreaks = this.absorbBreaks.filter((b) => now - b.at < ABSORB_BREAK_MS);
    for (const b of this.absorbBreaks) {
      const t = (now - b.at) / ABSORB_BREAK_MS, rand = seeded(b.seed), pieces = 7;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(230,130,255,${1 - t})`; ctx.lineWidth = Math.max(3 / z, 4) * (1 - t * 0.5);
      for (let i = 0; i < pieces; i++) {
        const u0 = i / pieces, u1 = u0 + 0.6 / pieces, side = (rand() - 0.5) * 2, off = side * 28 * t;
        const ax = b.o.x + (b.v.x - b.o.x) * u0, ay = b.o.y + (b.v.y - b.o.y) * u0, bx = b.o.x + (b.v.x - b.o.x) * u1, by = b.o.y + (b.v.y - b.o.y) * u1;
        const nx = -(b.v.y - b.o.y), ny = b.v.x - b.o.x, nl = Math.hypot(nx, ny) || 1;
        ctx.beginPath(); ctx.moveTo(ax + (nx / nl) * off, ay + (ny / nl) * off); ctx.lineTo(bx + (nx / nl) * off, by + (ny / nl) * off); ctx.stroke();
      }
      ctx.restore();
    }
  }
}
