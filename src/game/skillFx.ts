import type { SkillFx } from './protocol';

/** 스킬 연출(4.33): 충격파·갈고리·은신. 상태와 그리기만 맡고, 판정은 서버(Room)가 한다. 그림은 판정과 같은 크기로 그려 보는 쪽이 피할 수 있게 한다. */

type Pos = { x: number; y: number; r: number };
export type PosFn = (e: number, now: number) => Pos | null;

const SHOCK_FADE_MS = 250;     // 끝까지 퍼진 뒤 사라지는 시간
const HOOK_WAIT_MS = 250;      // 끝까지 뻗은 뒤 서버 결과(hookHit/hookEnd)를 기다리는 최대 시간
const FX_CAP = 24;
const STEALTH_FADE_MS = 550;   // 은신에 들어갈 때 사라지고, 풀릴 때 다시 나타나는 시간(끊긴 것과 구분되게 부드럽게)
const PUFF_MS = 750;           // 은신 시작·끝에 퍼지는 고리와 반짝임

interface Bolt { kind: 'poison' | 'darkness'; x: number; y: number; dx: number; dy: number; speed: number; range: number; radius: number; at: number }
interface Burst { x: number; y: number; kind: 'poison' | 'darkness'; at: number }
const BURST_MS = 450;
const BOLT_MIN_SCREEN_RADIUS = 6;   // 화면에서 투사체 반지름이 이보다 작아지지 않게 그린다(px)
const CLEANSE_MS = 900;

interface Shock { x: number; y: number; r0: number; rMax: number; speed: number; at: number }
interface Hook { e: number; dx: number; dy: number; range: number; ms: number; at: number; hit?: { t: number; at: number; ms: number }; endAt?: number }

export class SkillFxLayer {
  private shocks: Shock[] = [];
  private hooks: Hook[] = [];
  private stealth = new Map<number, { at: number; until: number }>();
  private bolts = new Map<number, Bolt>();
  private bursts: Burst[] = [];
  private poisons = new Map<number, { stacks: number; at: number; until: number }>();
  private darks = new Map<number, { at: number; until: number }>(); // 암흑에 걸린 원 번호 → 걸린 시각과 끝나는 시각
  private cleanses: { e: number; at: number; seed: number }[] = [];
  private stealthEnded = new Map<number, number>(); // 은신이 막 끝나 다시 나타나는 중인 원 번호 → 끝난 시각
  private puffs: { e: number; at: number; kind: 'out' | 'in' }[] = []; // 은신 시작(out)·끝(in) 연출

  /** 가장 최근에 쓴 그 원의 갈고리 중 조건에 맞는 것(같은 원의 갈고리는 하나만 남기므로 대개 하나다) */
  private latestHook(e: number, ok: (h: Hook) => boolean): Hook | undefined {
    for (let i = this.hooks.length - 1; i >= 0; i--) if (this.hooks[i].e === e && ok(this.hooks[i])) return this.hooks[i];
    return undefined;
  }

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.shocks = []; this.hooks = []; this.stealth.clear(); this.stealthEnded.clear(); this.puffs = []; this.bolts.clear(); this.bursts = []; this.poisons.clear(); this.darks.clear(); this.cleanses = []; }

  show(fx: SkillFx, now: number) {
    switch (fx.id) {
      case 'shockwave':
        if (this.shocks.length >= FX_CAP) this.shocks.shift();
        this.shocks.push({ x: fx.x, y: fx.y, r0: fx.r0, rMax: fx.rMax, speed: fx.speed, at: now });
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
      case 'cleanse':
        this.darks.delete(fx.e);
        if (this.cleanses.length >= FX_CAP) this.cleanses.shift();
        this.cleanses.push({ e: fx.e, at: now, seed: Math.floor(Math.random() * 2 ** 31) }); // seed: 쓸 때마다 끊어지는 모양이 다르게
        break;
    }
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

  /** 충격파와 갈고리: 원 위에 그린다 */
  drawActive(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.drawShocks(ctx, now, z);
    this.drawHooks(ctx, now, z, pos);
    this.drawPuffs(ctx, now, z, pos);
    this.drawBolts(ctx, now, z);
    this.drawPoisons(ctx, now, z, pos);
    this.drawDarks(ctx, now, z, pos);
    this.drawCleanses(ctx, now, z, pos);
  }

  /** 독(초록)·암흑(검정 + 보라 테두리) 투사체와 맞은 자리의 퍼지는 고리. 위치는 시작점에서 속도 × 지난 시간으로 구해 서버와 같은 곳에 그린다 */
  private drawBolts(ctx: CanvasRenderingContext2D, now: number, z: number) {
    for (const [id, b] of this.bolts) {
      const traveled = Math.min(b.range, b.speed * (now - b.at) / 1000);
      if (now - b.at > (b.range / b.speed) * 1000 + 400) { this.bolts.delete(id); continue; } // 끝 신호를 놓쳐도 사라진다
      const x = b.x + b.dx * traveled, y = b.y + b.dy * traveled;
      const r = Math.max(b.radius, BOLT_MIN_SCREEN_RADIUS / z); // 판정은 월드 반지름 그대로이고, 줌아웃해도 화면에서 이만큼은 보이게 그린다
      const poison = b.kind === 'poison';
      ctx.save();
      const len = r * 7; // 꼬리 길이도 투사체 크기에 맞춘다
      const tail = ctx.createLinearGradient(x, y, x - b.dx * len, y - b.dy * len);
      tail.addColorStop(0, poison ? 'rgba(90,220,90,0.55)' : 'rgba(120,70,200,0.5)');
      tail.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = tail; ctx.lineWidth = r * 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - b.dx * len, y - b.dy * len); ctx.stroke();
      ctx.fillStyle = poison ? '#4cd964' : '#14101c';
      ctx.strokeStyle = poison ? '#c9ffd0' : '#9b6cff'; ctx.lineWidth = Math.max(2 / z, 2.5);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    this.bursts = this.bursts.filter((u) => now - u.at < BURST_MS);
    for (const u of this.bursts) {
      const t = (now - u.at) / BURST_MS;
      ctx.save();
      ctx.strokeStyle = u.kind === 'poison' ? `rgba(90,220,90,${1 - t})` : `rgba(155,108,255,${1 - t})`;
      ctx.lineWidth = Math.max(3 / z, 5) * (1 - t * 0.6);
      ctx.beginPath(); ctx.arc(u.x, u.y, 14 + 60 * t, 0, Math.PI * 2); ctx.stroke();
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


  /**
   * 반지름이 각도에 따라 규칙적으로 오르내리는 닫힌 물결 곡선 경로(r(θ) = radius + amp·wave(lobes·θ + phase)).
   * wave는 사인과 삼각파를 섞어 뾰족한 지그재그 느낌이 나면서도 부드러운 곡선이다. lobes는 정수라 한 바퀴를 돌면 이어진다.
   */
  private wavePath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, amp: number, lobes: number, phase: number) {
    const steps = lobes * 10;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2, u = lobes * a + phase;
      const tri = (2 / Math.PI) * Math.asin(Math.sin(u)), w = 0.6 * tri + 0.4 * Math.sin(u); // -1..1
      const r = Math.max(0, radius + amp * w);
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  private drawShocks(ctx: CanvasRenderingContext2D, now: number, z: number) {
    this.shocks = this.shocks.filter((s) => now - s.at < (s.rMax - s.r0) / s.speed * 1000 + SHOCK_FADE_MS);
    for (const s of this.shocks) {
      const age = now - s.at, travelMs = Math.max(1, (s.rMax - s.r0) / s.speed * 1000);
      const radius = Math.min(s.rMax, s.r0 + (s.speed * age) / 1000);
      const alpha = 1 - Math.max(0, (age - travelMs) / SHOCK_FADE_MS);
      ctx.save();
      // 닿는 최대 범위(판정과 같다)를 옅은 점선으로 미리 보여 준다
      ctx.setLineDash([10 / z, 8 / z]);
      ctx.strokeStyle = `rgba(255,110,130,${0.35 * alpha})`;
      ctx.lineWidth = Math.max(2 / z, 3 / z);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.rMax, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const band = Math.max(5 / z, s.r0 * 0.22);
      // 앞쪽 가장자리는 깔끔한 원이 아니라 일정한 간격으로 지그재그인 물결 곡선이다. 물결의 마루가 판정 반지름(radius)을 넘지 않게
      // 안쪽으로 파여서 그려 눈에 보이는 범위가 판정보다 커지지 않는다. 바깥(흰색)과 안쪽(빨강) 줄은 위상이 반대라 엇갈려 일렁인다
      const amp = band * 0.5, lobes = Math.max(6, Math.min(24, Math.round((Math.PI * 2 * radius * z) / 90)));
      const phase = this.reducedMotion ? 0 : age / 140; // 물결이 천천히 돌며 퍼진다
      const grad = ctx.createRadialGradient(s.x, s.y, Math.max(0, radius - band * 3), s.x, s.y, radius);
      grad.addColorStop(0, 'rgba(255,90,110,0)');
      grad.addColorStop(1, `rgba(255,90,110,${0.28 * alpha})`);
      ctx.fillStyle = grad;
      this.wavePath(ctx, s.x, s.y, radius - amp, amp, lobes, phase); ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(255,225,230,${0.95 * alpha})`;
      ctx.lineWidth = band * 0.5;
      this.wavePath(ctx, s.x, s.y, radius - amp, amp, lobes, phase); ctx.stroke();
      ctx.strokeStyle = `rgba(255,70,100,${0.9 * alpha})`;
      ctx.lineWidth = band * 0.3;
      this.wavePath(ctx, s.x, s.y, Math.max(0, radius - band * 0.4 - amp), amp, lobes, phase + Math.PI); ctx.stroke();
      ctx.restore();
    }
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
        ctx.strokeStyle = 'rgba(255,70,100,0.95)';
        ctx.lineWidth = width * 1.2;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(v.x, v.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,230,235,0.9)';
        ctx.lineWidth = width * 0.4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(v.x, v.y); ctx.stroke();
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
      ctx.strokeStyle = 'rgba(255,70,100,0.95)';
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(hx, hy); ctx.stroke();
      // 갈고리 끝: 뾰족한 쐐기
      const tip = Math.max(9 / z, o.r * 0.3), nx = -h.dy, ny = h.dx;
      ctx.fillStyle = '#ffe3e8';
      ctx.strokeStyle = '#ff4664';
      ctx.lineWidth = Math.max(2 / z, width * 0.4);
      ctx.beginPath();
      ctx.moveTo(hx + h.dx * tip, hy + h.dy * tip);
      ctx.lineTo(hx + nx * tip * 0.6, hy + ny * tip * 0.6);
      ctx.lineTo(hx - nx * tip * 0.6, hy - ny * tip * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      keep.push(h);
      ctx.restore();
    }
    this.hooks = keep;
  }
}
